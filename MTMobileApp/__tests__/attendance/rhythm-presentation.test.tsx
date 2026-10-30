jest.mock('react-native-vector-icons/Ionicons', () => 'Icon')
import { currentFieldColorScheme, setFieldColorScheme } from '../../src/theme/fieldTheme'
import { timeColor, TIME_PALETTES } from '../../src/attendance/ui/TimeUI'
import { adjacentMonth, calendarDays } from '../../src/attendance/ui/TimeDateField'

const luminance = (hex: string) => {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
}
const contrast = (text: string, background: string) => { const values = [luminance(text), luminance(background)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05) }
it.each(['light', 'dark'] as const)('keeps normal-sized Rhythm %s text above 4.5:1, including filled actions', scheme => {
  const c = TIME_PALETTES[scheme]
  for (const [text, background] of [[c.ink, c.canvas], [c.muted, c.canvas], [c.accent, c.surface], [c.accent, c.inset], [c.onFill, c.fill], [c.blue, c.blueSoft], [c.amber, c.amberSoft], [c.danger, c.dangerSoft]]) {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
  }
})
it('offers real civil calendar dates across a leap February and year boundaries', () => {
  expect(calendarDays('2024-02').filter(Boolean)).toHaveLength(29)
  expect(calendarDays('2024-02')).toContain('2024-02-29')
  expect(calendarDays('2026-02').filter(Boolean)).toHaveLength(28)
  expect(calendarDays('2026-13')).toEqual([])
  expect(calendarDays('2026-06')[0]).toBe('2026-06-01') // Monday
  expect(adjacentMonth('2026-12', 1)).toBe('2027-01')
  expect(adjacentMonth('2026-01', -1)).toBe('2025-12')
})

it('follows the phone palette through live getters without rebuilding the provider', () => {
  const original = currentFieldColorScheme()
  try {
    setFieldColorScheme('dark'); expect(timeColor.accent).toBe(TIME_PALETTES.dark.accent)
    setFieldColorScheme('light'); expect(timeColor.accent).toBe(TIME_PALETTES.light.accent)
  } finally { setFieldColorScheme(original) }
})
