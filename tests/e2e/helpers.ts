import { expect, type Page } from '@playwright/test'

export const USERS = {
  hq: 'U-HQ-1',
  hq2: 'U-HQ-2',
  admin1: 'U-A1-ADM',
  member1: 'U-A1-M1',
  member1b: 'U-A1-M2',
  admin2: 'U-A2-ADM',
  member2: 'U-A2-M1',
  admin4: 'U-A4-ADM',
} as const

/** localStorage/sessionStorageを消して初期データから始める */
export async function resetApp(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/')
  await expect(page.getByTestId('login-U-HQ-1')).toBeVisible()
}

export async function loginAs(page: Page, userId: string): Promise<void> {
  if (!(await page.getByTestId(`login-${userId}`).isVisible().catch(() => false))) {
    await page.goto('/')
  }
  await page.getByTestId(`login-${userId}`).click()
  await expect(page).toHaveURL(/#\/dashboard/)
}

export async function startAs(page: Page, userId: string): Promise<void> {
  await resetApp(page)
  await loginAs(page, userId)
}

/** ログイン状態を保ったまま、別ユーザーへ切り替える(データは維持) */
export async function switchUser(page: Page, userId: string): Promise<void> {
  await page.getByTestId('logout').click()
  await expect(page.getByTestId(`login-${userId}`)).toBeVisible()
  await page.getByTestId(`login-${userId}`).click()
  await expect(page).toHaveURL(/#\/dashboard/)
}

export async function goto(page: Page, hash: string): Promise<void> {
  await page.goto(`/#/${hash.replace(/^\//, '')}`)
}

/** 画面が横方向へはみ出していないこと(§19) */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }))
  expect(scrollW, `横スクロールが発生しています (${scrollW} > ${clientW})`).toBeLessThanOrEqual(clientW + 1)
}

/** 収集したコンソールエラー(§21.4) */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}
