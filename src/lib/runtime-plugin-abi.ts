import type { RequestEvent } from '@sveltejs/kit';
import type { Sequelize } from 'sequelize';
import type {
  PluginConfig,
  PluginDefinition,
  PluginLocalizedText,
  RuntimePluginAbi,
  RuntimePluginTrust,
  RuntimePluginUiDescriptor,
} from '$lib/plugin-contracts';
import type { SiteLocale, SiteSettings } from './config';

export const runtimePluginAbi: RuntimePluginAbi = 'shortlink.runtime-plugin.v1';

export interface RuntimePluginManifest {
  abi: RuntimePluginAbi;
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  order?: number;
  required?: boolean;
  trust?: RuntimePluginTrust;
  entry?: string;
  assets?: string;
  defaultConfig?: PluginConfig;
  translations?: Partial<Record<SiteLocale, PluginLocalizedText>>;
  admin?: RuntimePluginUiDescriptor;
  account?: RuntimePluginUiDescriptor;
  userAdmin?: RuntimePluginUiDescriptor;
  slots?: Record<string, RuntimePluginUiDescriptor>;
}

export interface RuntimePluginMigration {
  id: string;
  shouldRun: (input: { sequelize: Sequelize }) => boolean | Promise<boolean>;
  up: (input: { sequelize: Sequelize }) => void | Promise<void>;
}

export interface RuntimePluginFormSdk {
  string(form: FormData, name: string, fallback?: string): string;
  boolean(form: FormData, name: string): boolean;
  stringArray(form: FormData, name: string): string[];
}

export interface RuntimePluginSdkV1 {
  abi: RuntimePluginAbi;
  form: RuntimePluginFormSdk;
  text: {
    interpolate(
      template: string,
      values: Record<string, string | number>,
    ): string;
  };
  http: {
    outboundFetch(
      resource: RequestInfo | URL,
      init: RequestInit & {
        settings: SiteSettings;
        purpose?: string;
        timeoutMs?: number;
        maxRedirects?: number;
      },
    ): Promise<Response>;
  };
  log: {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
  };
}

export interface RuntimePluginModule {
  default: (api: RuntimePluginSdkV1) => RuntimePluginFactoryResult;
}

export type RuntimePluginFactoryResult = Partial<
  Omit<PluginDefinition, 'defaultConfig' | 'meta' | 'runtime'>
> &
  Pick<PluginDefinition, 'defaultConfig'> &
  Partial<Pick<PluginDefinition, 'meta'>> & {
    dispose?: () => void | Promise<void>;
  };

export interface RuntimeRequestContext {
  event: RequestEvent;
  request: Request;
  url: URL;
  routeId: string | null;
}
