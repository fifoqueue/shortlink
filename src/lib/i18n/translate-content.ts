import type { PluginLocaleKey, PluginLocaleStrings } from '$lib/plugin-contracts';

const translatedAttributeKeys = [
  ['data-i18n-placeholder', 'placeholder'],
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
  ['data-i18n-aria-valuetext', 'aria-valuetext'],
] as const;

function localizedText(
  strings: PluginLocaleStrings,
  key: string | null | undefined,
) {
  return key ? strings[key as PluginLocaleKey] : undefined;
}

function translateElement(element: Element, strings: PluginLocaleStrings) {
  const textKey = element.getAttribute('data-i18n');
  const text = localizedText(strings, textKey);
  if (text !== undefined) element.textContent = text;

  for (const [keyAttr, targetAttr] of translatedAttributeKeys) {
    const value = localizedText(strings, element.getAttribute(keyAttr));
    if (value !== undefined) element.setAttribute(targetAttr, value);
  }
}

function translateTree(root: Node, strings: PluginLocaleStrings) {
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  translateElement(element, strings);
  for (const child of element.querySelectorAll(
    [
      '[data-i18n]',
      ...translatedAttributeKeys.map(([keyAttr]) => `[${keyAttr}]`),
    ].join(','),
  )) {
    translateElement(child, strings);
  }
}

export function translateContent(
  node: HTMLElement,
  strings: PluginLocaleStrings = {},
) {
  let currentStrings = strings;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        translateTree(mutation.target, currentStrings);
      }
      for (const addedNode of mutation.addedNodes) {
        translateTree(addedNode, currentStrings);
      }
    }
  });

  translateTree(node, currentStrings);
  observer.observe(node, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-i18n',
      ...translatedAttributeKeys.map(([keyAttr]) => keyAttr),
    ],
  });

  return {
    update(nextStrings: PluginLocaleStrings = {}) {
      currentStrings = nextStrings;
      translateTree(node, currentStrings);
    },
    destroy() {
      observer.disconnect();
    },
  };
}
