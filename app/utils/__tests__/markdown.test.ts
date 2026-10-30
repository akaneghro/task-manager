import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../markdown'

describe('renderMarkdown', () => {
  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
  })

  it('renders basic markdown', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('strips javascript: links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
  })

  it('strips data: and relative hrefs but keeps mailto and anchors', () => {
    expect(renderMarkdown('[x](data:text/html,hi)')).not.toContain('data:')
    expect(renderMarkdown('[x](/admin)')).not.toContain('href')
    expect(renderMarkdown('[mail](mailto:a@b.c)')).toContain('href="mailto:a@b.c"')
    expect(renderMarkdown('[top](#top)')).toContain('href="#top"')
  })

  it('escapes or drops raw HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nhello <b onclick="x()">b</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).toContain('hello')
  })

  it('renders GFM task lists with disabled checkboxes', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
    expect(html).toContain('disabled')
    expect(html).toContain('task-list-item')
  })

  it('opens external links in a new tab with rel noopener noreferrer', () => {
    const html = renderMarkdown('[site](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('does not add target to anchors', () => {
    expect(renderMarkdown('[a](#x)')).not.toContain('target=')
  })

  it('keeps only https images', () => {
    expect(renderMarkdown('![ok](https://example.com/a.png)')).toContain('src="https://example.com/a.png"')
    expect(renderMarkdown('![no](http://example.com/a.png)')).not.toContain('<img')
    expect(renderMarkdown('![no](data:image/png;base64,AAAA)')).not.toContain('<img')
  })

  it('renders GFM tables', () => {
    expect(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table>')
  })
})
