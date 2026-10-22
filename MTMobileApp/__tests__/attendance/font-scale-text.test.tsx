let mockFontScale = 1
jest.mock('react-native', () => {
  const TestReact = require('react')
  return {
    useWindowDimensions: () => ({ width: 390, height: 800, scale: 3, fontScale: mockFontScale }),
    // Model the RN 0.84 paragraph: glyphs follow resources, measured Content
    // remains cached on that native paragraph until it is replaced.
    Text: TestReact.forwardRef(function CachedParagraph(props: Record<string, unknown>, ref: unknown) {
      const [measuredScale] = TestReact.useState(mockFontScale)
      TestReact.useImperativeHandle(ref, () => ({ measure: jest.fn() }))
      return TestReact.createElement('MeasuredParagraph', {
        ...props, measuredHeight: 20 * measuredScale, glyphHeight: 20 * mockFontScale,
      })
    }),
  }
})
import React, { useState } from 'react'
import { Text as NativeText } from 'react-native'
import TestRenderer, { act } from 'react-test-renderer'
import { TimeFontScale, TimePresentationProvider } from '../../src/attendance/ui/TimePresentation'
import { TimeText } from '../../src/attendance/ui/TimeText'

const roots: TestRenderer.ReactTestRenderer[] = []
afterEach(() => { act(() => roots.splice(0).forEach(root => root.unmount())); mockFontScale = 1 })

it('remeasures Time text across font changes while retaining the unsent form and native props/ref', () => {
  const ref = React.createRef<React.ComponentRef<typeof NativeText>>()
  function Form() {
    const [reason, setReason] = useState('')
    return <>
      <TimeText ref={ref} testID="reason-label" accessibilityLabel="Reason" allowFontScaling>Reason</TimeText>
      {React.createElement('DraftInput', { value: reason, onChangeText: setReason })}
    </>
  }
  const render = () => <TimePresentationProvider><Form /></TimePresentationProvider>
  let root!: TestRenderer.ReactTestRenderer
  act(() => { root = TestRenderer.create(render()) }); roots.push(root)
  act(() => root.root.findByType('DraftInput').props.onChangeText('Unsent reason'))
  const input = root.root.findByType('DraftInput')
  for (const scale of [2, 1]) {
    mockFontScale = scale; act(() => root.update(render()))
    const paragraph = root.root.findByType('MeasuredParagraph')
    expect(paragraph.props.measuredHeight).toBe(paragraph.props.glyphHeight)
    expect(paragraph.props.measuredHeight).toBe(20 * scale)
    expect(paragraph.props.allowFontScaling).toBe(true)
    expect(paragraph.props.accessibilityLabel).toBe('Reason')
    expect(ref.current).not.toBeNull()
    expect(root.root.findByType('DraftInput')).toBe(input)
    expect(input.props.value).toBe('Unsent reason')
  }
})

it('keeps the ordinary MTM native text instance when it has not opted into Time', () => {
  const render = () => <TimeFontScale.Provider value={mockFontScale}><TimeText>MTM</TimeText></TimeFontScale.Provider>
  let root!: TestRenderer.ReactTestRenderer
  act(() => { root = TestRenderer.create(render()) }); roots.push(root)
  const original = root.root.findByType('MeasuredParagraph')
  mockFontScale = 2; act(() => root.update(render()))
  expect(root.root.findByType('MeasuredParagraph')).toBe(original)
})
