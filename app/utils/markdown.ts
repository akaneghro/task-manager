// Markdown -> sanitized HTML. The only place where user markdown becomes HTML (see CLAUDE.md, Security Rules).
// Adapted from markdown-viewer (no Shiki, no Tauri): synchronous so it can run inside computed().

import type { Element, Parents, Root } from 'hast'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

const SAFE_HREF = /^(?:https?:\/\/|mailto:|#)/i
const EXTERNAL_HREF = /^https?:\/\//i
const SAFE_IMG_SRC = /^https:\/\//i

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['https'],
  },
}

/** Restricts links/images after sanitizing and opens external links in a new tab. */
function rehypeSafeLinks() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index: number | undefined, parent: Parents | undefined) => {
      if (node.tagName === 'a') {
        const href = typeof node.properties.href === 'string' ? node.properties.href.trim() : ''
        if (!href || !SAFE_HREF.test(href)) {
          delete node.properties.href
          return
        }
        if (EXTERNAL_HREF.test(href)) {
          node.properties.target = '_blank'
          node.properties.rel = ['noopener', 'noreferrer']
        }
        return
      }
      if (node.tagName === 'img') {
        const src = typeof node.properties.src === 'string' ? node.properties.src.trim() : ''
        if (!SAFE_IMG_SRC.test(src) && parent && index !== undefined) {
          parent.children.splice(index, 1)
          return [SKIP, index]
        }
        node.properties.loading = 'lazy'
        node.properties.referrerPolicy = 'no-referrer'
      }
    })
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeSafeLinks)
  .use(rehypeStringify)

/** Renders GitHub-flavoured markdown to sanitized HTML (synchronous). Raw HTML in the source is escaped/dropped. */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  return String(processor.processSync(source))
}
