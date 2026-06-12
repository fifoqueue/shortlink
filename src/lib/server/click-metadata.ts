import type { ClickMetadataDisplayItem } from '$lib/plugin-contracts';
import { formatText, uiText } from '$lib/i18n/ui-text';
import type { SiteLocale } from '$lib/config';
import type {
  MatchedRedirectRule,
  RedirectRuleCondition,
} from './redirect-rules';

export const CORE_CLICK_METADATA_KEY = '__core';

type CoreClickMetadataFormatter = (input: {
  metadata: Record<string, unknown>;
  text: ReturnType<typeof uiText>;
}) => ClickMetadataDisplayItem[];

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function redirectConditionMetadata(condition: RedirectRuleCondition) {
  return {
    type: condition.type,
    matchKey: condition.matchKey,
    matchValue: condition.matchValue,
  };
}

export function redirectRuleClickMetadata(input: {
  ruleCount: number;
  destinationUrl: string;
  matchedRule: MatchedRedirectRule | null;
}) {
  if (input.ruleCount <= 0) return {};

  const ruleIndex = input.matchedRule?.index ?? null;
  return {
    [CORE_CLICK_METADATA_KEY]: {
      redirect: {
        version: 1,
        source: input.matchedRule ? 'rule' : 'default',
        matched: input.matchedRule !== null,
        ruleIndex,
        ruleNumber: ruleIndex === null ? null : ruleIndex + 1,
        destinationUrl: input.destinationUrl.slice(0, 2_000),
        conditions:
          input.matchedRule?.rule.conditions.map(redirectConditionMetadata) ??
          [],
      },
    },
  };
}

function conditionSummary(condition: unknown) {
  const value = recordValue(condition);
  if (!value) return '';

  const type = stringValue(value.type);
  const matchKey = stringValue(value.matchKey);
  const matchValue = stringValue(value.matchValue);
  const target = [matchKey, matchValue].filter(Boolean).join('=');
  return target ? `${type}:${target}` : type;
}

const redirectFormatter: CoreClickMetadataFormatter = ({ metadata, text }) => {
  const core = recordValue(metadata[CORE_CLICK_METADATA_KEY]);
  const redirect = recordValue(core?.redirect);
  if (!redirect) return [];

  const destinationUrl = stringValue(redirect.destinationUrl);
  if (!destinationUrl) return [];

  const matched = redirect.matched === true;
  const ruleNumber = numberValue(redirect.ruleNumber);
  const details: ClickMetadataDisplayItem[] = [
    {
      label: text.stats.redirectResult,
      value:
        matched && ruleNumber !== null
          ? formatText(text.stats.redirectRuleMatched, {
              index: ruleNumber,
              destination: destinationUrl,
            })
          : formatText(text.stats.redirectDefaultDestination, {
              destination: destinationUrl,
            }),
    },
  ];

  const conditions = Array.isArray(redirect.conditions)
    ? redirect.conditions.map(conditionSummary).filter(Boolean)
    : [];
  if (conditions.length > 0) {
    details.push({
      label: text.stats.redirectRuleConditions,
      value: conditions.join(', '),
    });
  }

  return details;
};

const coreClickMetadataFormatters: CoreClickMetadataFormatter[] = [
  redirectFormatter,
];

export function formatCoreClickMetadata(input: {
  metadata: Record<string, unknown>;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
}) {
  const text = uiText(input.locale, input.fallbackLocale);
  return coreClickMetadataFormatters.flatMap((formatter) =>
    formatter({ metadata: input.metadata, text }),
  );
}

export function formatCoreClickMetadataList(input: {
  metadataItems: Array<Record<string, unknown>>;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
}) {
  return input.metadataItems.map((metadata) =>
    formatCoreClickMetadata({
      metadata,
      locale: input.locale,
      fallbackLocale: input.fallbackLocale,
    }),
  );
}

export function combineClickMetadataDisplayLists(
  ...lists: ClickMetadataDisplayItem[][][]
) {
  const count = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: count }, (_, index) =>
    lists.flatMap((list) => list[index] ?? []),
  );
}
