import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

describe('Middleware can set the matcher in its config', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('does not add the header for root request', async () => {
    const response = await fetchViaHTTP(next.url, '/')
    expect(response.headers.get('X-From-Middleware')).toBeNull()
    expect(await response.text()).toContain('root page')
  })

  it('adds the header for a matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/with-middleware')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
    expect(await response.text()).toContain('This should run the middleware')
  })

  it('adds the header for a matched data path', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/with-middleware.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello, cruel world.',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('adds the header for another matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/another-middleware')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
    expect(await response.text()).toContain(
      'This should also run the middleware'
    )
  })

  it('adds the header for another matched data path', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/another-middleware.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello, magnificent world.',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('does not add the header for root data request', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/index.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello, world.',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBeNull()
  })

  it('should load matches in client manifest correctly', async () => {
    const browser = await webdriver(next.url, '/')

    await check(async () => {
      const manifest = await browser.eval(
        (global as any).isNextDev
          ? 'window.__DEV_MIDDLEWARE_MANIFEST'
          : 'window.__MIDDLEWARE_MANIFEST'
      )

      return Array.isArray(manifest) &&
        manifest?.[0]?.[0].includes('with-middleware') &&
        manifest?.[0]?.[0].includes('another-middleware')
        ? 'success'
        : manifest
    }, 'success')
  })

  it('should navigate correctly with matchers', async () => {
    const browser = await webdriver(next.url, '/')
    await browser.eval('window.beforeNav = 1')

    await browser.elementByCss('#to-another-middleware').click()
    await browser.waitForElementByCss('#another-middleware')

    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      message: 'Hello, magnificent world.',
    })

    await browser.elementByCss('#to-index').click()
    await browser.waitForElementByCss('#index')

    await browser.elementByCss('#to-blog-slug-1').click()
    await browser.waitForElementByCss('#blog')
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      message: 'Hello, magnificent world.',
      params: {
        slug: 'slug-1',
      },
    })

    await browser.elementByCss('#to-blog-slug-2').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /"slug":"slug-2"/
    )
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      message: 'Hello, magnificent world.',
      params: {
        slug: 'slug-2',
      },
    })
  })
})

describe('using a single matcher', () => {
  let next: NextInstance
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/[...route].js': `
          export default function Page({ message }) { 
            return <div>
              <p>root page</p>
              <p>{message}</p>
            </div>
          } 

          export const getServerSideProps = ({ params }) => {
            return {
              props: {
                message: "Hello from /" + params.route.join("/")
              }
            }
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'
          export const config = {
            matcher: '/middleware/works'
          };
          export default (req) => {
            const res = NextResponse.next();
            res.headers.set('X-From-Middleware', 'true');
            return res;
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('adds the header for a matched path', async () => {
    const response = await fetchViaHTTP(next.url, '/middleware/works')
    expect(await response.text()).toContain('Hello from /middleware/works')
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('adds the headers for a matched data path', async () => {
    const response = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/middleware/works.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await response.json()).toMatchObject({
      pageProps: {
        message: 'Hello from /middleware/works',
      },
    })
    expect(response.headers.get('X-From-Middleware')).toBe('true')
  })

  it('does not add the header for an unmatched path', async () => {
    const response = await fetchViaHTTP(next.url, '/about/me')
    expect(await response.text()).toContain('Hello from /about/me')
    expect(response.headers.get('X-From-Middleware')).toBeNull()
  })
})

describe('using a single matcher with i18n', () => {
  let next: NextInstance
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page({ message }) { 
            return <div>
              <p>{message}</p>
            </div>
          } 
          export const getServerSideProps = ({ params, locale }) => ({
            props: { message: \`(\${locale}) Hello from /\` }
          })
        `,
        'pages/[...route].js': `
          export default function Page({ message }) {
            return <div>
              <p>catchall page</p>
              <p>{message}</p>
            </div>
          } 
          export const getServerSideProps = ({ params, locale }) => ({
            props: { message: \`(\${locale}) Hello from /\` + params.route.join("/") }
          })
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'
          export const config = { matcher: '/' };
          export default (req) => {
            const res = NextResponse.next();
            res.headers.set('X-From-Middleware', 'true');
            return res;
          }
        `,
        'next.config.js': `
          module.exports = {
            i18n: {
              localeDetection: false,
              locales: ['es', 'en'],
              defaultLocale: 'en',
            }
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it(`adds the header for a matched path`, async () => {
    const res1 = await fetchViaHTTP(next.url, `/`)
    expect(await res1.text()).toContain(`(en) Hello from /`)
    expect(res1.headers.get('X-From-Middleware')).toBe('true')
    const res2 = await fetchViaHTTP(next.url, `/es`)
    expect(await res2.text()).toContain(`(es) Hello from /`)
    expect(res2.headers.get('X-From-Middleware')).toBe('true')
  })

  it(`adds the headers for a matched data path`, async () => {
    const res1 = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/en.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await res1.json()).toMatchObject({
      pageProps: { message: `(en) Hello from /` },
    })
    expect(res1.headers.get('X-From-Middleware')).toBe('true')
    const res2 = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/es.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await res2.json()).toMatchObject({
      pageProps: { message: `(es) Hello from /` },
    })
    expect(res2.headers.get('X-From-Middleware')).toBe('true')
  })

  it(`does not add the header for an unmatched path`, async () => {
    const response = await fetchViaHTTP(next.url, `/about/me`)
    expect(await response.text()).toContain('Hello from /about/me')
    expect(response.headers.get('X-From-Middleware')).toBeNull()
  })
})

describe('using a single matcher with i18n and basePath', () => {
  let next: NextInstance
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page({ message }) { 
            return <div>
              <p>root page</p>
              <p>{message}</p>
            </div>
          } 
          export const getServerSideProps = ({ params, locale }) => ({
            props: { message: \`(\${locale}) Hello from /\` }
          })
        `,
        'pages/[...route].js': `
          export default function Page({ message }) {
            return <div>
              <p>catchall page</p>
              <p>{message}</p>
            </div>
          } 
          export const getServerSideProps = ({ params, locale }) => ({
            props: { message: \`(\${locale}) Hello from /\` + params.route.join("/") }
          })
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'
          export const config = { matcher: '/' };
          export default (req) => {
            const res = NextResponse.next();
            res.headers.set('X-From-Middleware', 'true');
            return res;
          }
        `,
        'next.config.js': `
          module.exports = {
            basePath: '/root',
            i18n: {
              localeDetection: false,
              locales: ['es', 'en'],
              defaultLocale: 'en',
            }
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it(`adds the header for a matched path`, async () => {
    const res1 = await fetchViaHTTP(next.url, `/root`)
    expect(await res1.text()).toContain(`(en) Hello from /`)
    expect(res1.headers.get('X-From-Middleware')).toBe('true')
    const res2 = await fetchViaHTTP(next.url, `/root/es`)
    expect(await res2.text()).toContain(`(es) Hello from /`)
    expect(res2.headers.get('X-From-Middleware')).toBe('true')
  })

  it(`adds the headers for a matched data path`, async () => {
    const res1 = await fetchViaHTTP(
      next.url,
      `/root/_next/data/${next.buildId}/en.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await res1.json()).toMatchObject({
      pageProps: { message: `(en) Hello from /` },
    })
    expect(res1.headers.get('X-From-Middleware')).toBe('true')
    const res2 = await fetchViaHTTP(
      next.url,
      `/root/_next/data/${next.buildId}/es.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    expect(await res2.json()).toMatchObject({
      pageProps: { message: `(es) Hello from /` },
    })
    expect(res2.headers.get('X-From-Middleware')).toBe('true')
  })

  it(`does not add the header for an unmatched path`, async () => {
    const response = await fetchViaHTTP(next.url, `/root/about/me`)
    expect(await response.text()).toContain('Hello from /about/me')
    expect(response.headers.get('X-From-Middleware')).toBeNull()
  })
})
