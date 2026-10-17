import { load } from 'cheerio'

const compact = (value, limit = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)

// Parse the sandbox DOM without running scripts or contacting the target site.
// Send field labels/types, never prefilled input values, to the analysis model.
export function summarizePage(html, pageUrl) {
  const $ = load(html)
  $('script, style, noscript, template, [hidden], [aria-hidden="true"]').remove()
  const fields = $('input, select, textarea').toArray().filter(el => $(el).attr('type') !== 'hidden').slice(0, 60).map(el => {
    const field = $(el)
    const id = field.attr('id')
    const label = $('label').toArray().find(item => id && $(item).attr('for') === id)
    return {
      type: compact(field.attr('type') || el.tagName, 40),
      name: compact(field.attr('name'), 100),
      label: compact(label ? $(label).text() : field.closest('label').text(), 200),
      placeholder: compact(field.attr('placeholder'), 200),
      required: field.attr('required') !== undefined,
    }
  })
  const forms = $('form').toArray().slice(0, 10).map(el => {
    const form = $(el)
    let action = null
    try { action = new URL(form.attr('action') || '', pageUrl).href } catch { /* Invalid action stays null. */ }
    return { method: (form.attr('method') || 'GET').toUpperCase(), action }
  })
  // Strip values remaining in elements before collecting page text.
  $('input, textarea').remove()
  return {
    title: compact($('title').text(), 300),
    text: compact($('body').text(), 12000),
    fields, forms,
  }
}
