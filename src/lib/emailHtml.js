import { sanitizeHtml } from './sanitizeHtml.js';

const BLOCK_SELECTOR = 'p,div,ul,ol,li,blockquote,h1,h2,h3,h4,h5,h6';

function setDefaultStyle(element, property, value) {
  if (!element.style.getPropertyValue(property)) element.style.setProperty(property, value);
}

/** Make contenteditable HTML carry its visual spacing into Outlook. The editor
 * stylesheet is not part of an email, so paragraph/list/line-height rules must
 * be inline on the payload instead of relying on browser defaults. */
export function normalizeEmailHtml(html) {
  const clean = sanitizeHtml(html);
  if (!clean || typeof document === 'undefined') return clean;
  const template = document.createElement('template');
  template.innerHTML = clean;

  // Chromium sometimes uses root DIVs for Enter. Convert simple line blocks
  // to the same paragraph model the editor otherwise produces.
  for (const div of Array.from(template.content.children).filter((node) => node.tagName === 'DIV')) {
    if (div.querySelector(BLOCK_SELECTOR)) continue;
    const paragraph = document.createElement('p');
    for (const attribute of Array.from(div.attributes)) {
      paragraph.setAttribute(attribute.name, attribute.value);
    }
    paragraph.append(...div.childNodes);
    div.replaceWith(paragraph);
  }

  for (const element of template.content.querySelectorAll('p,div,li,blockquote')) {
    setDefaultStyle(element, 'line-height', '1.6');
  }
  for (const paragraph of template.content.querySelectorAll('p')) {
    setDefaultStyle(paragraph, 'margin', '0 0 8px');
    if (!paragraph.nextElementSibling) paragraph.style.marginBottom = '0';
  }
  for (const list of template.content.querySelectorAll('ul,ol')) {
    setDefaultStyle(list, 'margin', '0 0 8px');
    setDefaultStyle(list, 'padding-left', '22px');
  }
  for (const item of template.content.querySelectorAll('li')) {
    setDefaultStyle(item, 'margin', '0');
  }
  for (const image of template.content.querySelectorAll('img')) {
    const width = Math.max(0, Number.parseFloat(image.getAttribute('width') || image.style.width || ''));
    if (width) {
      image.setAttribute('width', String(Math.round(width)));
      image.style.width = `${Math.round(width)}px`;
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
    }
  }
  return sanitizeHtml(template.innerHTML);
}

export default normalizeEmailHtml;
