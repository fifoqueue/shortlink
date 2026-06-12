import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import type { Component } from 'svelte';
import type { SiteLocale, SiteSettings } from '$lib/config';

export type PluginConfig = Record<string, unknown>;
export type CorePluginSlot =
  | 'top'
  | 'form-extra'
  | 'form-footer'
  | 'login-extra'
  | 'signup-extra'
  | 'footer';
export type PluginSlot = CorePluginSlot | (string & {});

export interface PluginState {
  enabled: boolean;
  config: PluginConfig;
}

export interface PluginMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  required?: boolean;
  order?: number;
  adminAccessPermissions?: AdminPluginAccessPermission[];
}

export type PluginLocaleKey = `${string}.${string}`;
export type PluginLocaleStrings = Partial<Record<PluginLocaleKey, string>>;

export interface PluginLocalizedText {
  meta?: Partial<Pick<PluginMeta, 'name' | 'description' | 'category'>>;
  strings?: PluginLocaleStrings;
}

export interface PluginActivationStatus {
  allowed: boolean;
  reason?: string;
}

export type AdminPluginAccessPermission = 'manageUsers' | 'managePermissions';

export interface PluginAdminPermissionContext {
  isAdmin: boolean;
  admin: {
    access: boolean;
    sections: string[];
    manageSections: string[];
    plugins: string[];
    manageUsers: boolean;
    managePermissions: boolean;
  };
}

export interface PluginAdminAccessStatus {
  allowed: boolean;
  reason?: string;
  redirectTo?: string;
}

export type CorePluginProtectedAction = 'login' | 'signup' | 'link-create';
export type PluginProtectedAction = CorePluginProtectedAction | (string & {});

export interface PluginGuardResult {
  allowed: boolean;
  message?: string;
}

export interface AuthenticatedUser {
  id: number;
  provider: string;
  subject: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
}

export interface ClickMetadataDisplayItem {
  label: string;
  value: string;
}

export interface ClickMetadataSearchField {
  id: string;
  label: string;
  paths: string[][];
}

export interface PluginOutboundProxyConfig {
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  rawUrl?: string;
  searchParams?: Record<string, string>;
}

export interface PluginOutboundProxyProtocol {
  protocol: string;
  defaultPort: number;
}

export interface PluginOutboundProxyRequestResult {
  url: string;
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface AuthMethodPresentation {
  buttonColor?: string;
  buttonTextColor?: string;
  iconUrl?: string;
}

export interface AuthLoginMethod extends AuthMethodPresentation {
  id: string;
  label: string;
  type: 'password' | 'redirect';
}

export interface AuthAccountLinkMethod extends AuthMethodPresentation {
  id: string;
  label: string;
  type: 'redirect';
}

export interface PluginLocaleContext {
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
  strings: PluginLocaleStrings;
}

export interface AuthPluginModule {
  id: string;
  getUser: (
    cookies: Cookies,
    config: PluginConfig,
  ) => AuthenticatedUser | null | Promise<AuthenticatedUser | null>;
  clearSession?: (cookies: Cookies) => void | Promise<void>;
  getLoginMethods?: (
    config: PluginConfig,
    context?: PluginLocaleContext,
  ) => AuthLoginMethod[];
  getAccountLinkMethods?: (
    config: PluginConfig,
    context?: PluginLocaleContext,
  ) => AuthAccountLinkMethod[];
  authenticatePassword?: (
    cookies: Cookies,
    config: PluginConfig,
    email: string,
    password: string,
    context?: PluginLocaleContext,
  ) => AuthenticatedUser | null | Promise<AuthenticatedUser | null>;
  startLogin?: (
    cookies: Cookies,
    origin: string,
    config: PluginConfig,
    methodId: string,
    returnTo: string | null,
    context?: PluginLocaleContext,
  ) => URL | Promise<URL>;
  finishLogin?: (
    cookies: Cookies,
    currentUrl: URL,
    config: PluginConfig,
    context?: PluginLocaleContext,
  ) => string | Promise<string>;
  startAccountLink?: (
    cookies: Cookies,
    origin: string,
    config: PluginConfig,
    methodId: string,
    user: AuthenticatedUser,
    returnTo: string | null,
    context?: PluginLocaleContext,
  ) => URL | Promise<URL>;
  finishAccountLink?: (
    cookies: Cookies,
    currentUrl: URL,
    config: PluginConfig,
    user: AuthenticatedUser,
    context?: PluginLocaleContext,
  ) => string | Promise<string>;
}

export interface PluginDefinition {
  meta: PluginMeta;
  translations?: Partial<Record<SiteLocale, PluginLocalizedText>>;
  defaultConfig: PluginConfig;
  parseConfig: (
    form: FormData,
    current: PluginConfig,
    input?: {
      defaultLocale: SiteLocale;
      locale?: SiteLocale;
      fallbackLocale?: SiteLocale;
      strings?: PluginLocaleStrings;
      settings?: SiteSettings;
    },
  ) => PluginConfig;
  prepareAdminConfig?: (config: PluginConfig) => PluginConfig;
  validateConfig?: (
    config: PluginConfig,
    context?: PluginLocaleContext,
  ) => void | Promise<void>;
  canEnable?: (input: {
    state: PluginState;
    url: URL;
  }) => PluginActivationStatus | Promise<PluginActivationStatus>;
  canDisable?: (input: {
    state: PluginState;
    url: URL;
  }) => PluginActivationStatus | Promise<PluginActivationStatus>;
  canAccessAdminAction?: (input: {
    action: string;
    permissions: PluginAdminPermissionContext;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) => PluginAdminAccessStatus | Promise<PluginAdminAccessStatus>;
  canAccessAdminSubpage?: (input: {
    item: string;
    permissions: PluginAdminPermissionContext;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) => PluginAdminAccessStatus | Promise<PluginAdminAccessStatus>;
  loadAdminData?: (input: {
    state: PluginState;
    url: URL;
    settings: SiteSettings;
  }) => unknown | Promise<unknown>;
  handleAdminAction?: (input: {
    action: string;
    form: FormData;
    state: PluginState;
    url: URL;
    user: AuthenticatedUser | null;
    isAdmin: boolean;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) =>
    | {
        enabled?: boolean;
        config?: PluginConfig;
        ok?: boolean;
        message?: string;
      }
    | Promise<{
        enabled?: boolean;
        config?: PluginConfig;
        ok?: boolean;
        message?: string;
      }>;
  loadAdminSubpage?: (input: {
    item: string;
    state: PluginState;
    url: URL;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) => unknown | Promise<unknown>;
  handleAdminSubpageAction?: (input: {
    item: string;
    action: string;
    form: FormData;
    state: PluginState;
    url: URL;
    user: AuthenticatedUser | null;
    isAdmin: boolean;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) =>
    | {
        ok?: boolean;
        message?: string;
        redirectTo?: string;
      }
    | Promise<{
        ok?: boolean;
        message?: string;
        redirectTo?: string;
      }>;
  loadUserAdminData?: (input: {
    userId: number;
    state: PluginState;
    url: URL;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) => unknown | Promise<unknown>;
  handleUserAdminAction?: (input: {
    userId: number;
    action: string;
    form: FormData;
    state: PluginState;
    url: URL;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) =>
    | {
        ok?: boolean;
        message?: string;
      }
    | Promise<{
        ok?: boolean;
        message?: string;
      }>;
  loadAccountData?: (input: {
    user: AuthenticatedUser;
    state: PluginState;
    url: URL;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) => unknown | Promise<unknown>;
  handleAccountAction?: (input: {
    user: AuthenticatedUser;
    action: string;
    form: FormData;
    state: PluginState;
    url: URL;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
  }) =>
    | {
        ok?: boolean;
        message?: string;
      }
    | Promise<{
        ok?: boolean;
        message?: string;
      }>;
  verifyFormSubmission?: (input: {
    action: PluginProtectedAction;
    form: FormData;
    request: Request;
    url: URL;
    state: PluginState;
    user: AuthenticatedUser | null;
    isAdmin: boolean;
    ip: string;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
    settings: SiteSettings;
  }) => PluginGuardResult | Promise<PluginGuardResult>;
  handleRequest?: (input: {
    event: RequestEvent;
    state: PluginState;
    user: AuthenticatedUser | null;
    isAdmin: boolean;
    ip: string;
  }) => Response | null | undefined | Promise<Response | null | undefined>;
  collectClickMetadata?: (input: {
    request: Request;
    ip: string;
    state: PluginState;
    settings: SiteSettings;
  }) =>
    | Record<string, unknown>
    | null
    | undefined
    | Promise<Record<string, unknown> | null | undefined>;
  formatClickMetadata?: (input: {
    metadata: unknown;
    state: PluginState;
    isAdmin: boolean;
    isOwner: boolean;
  }) => ClickMetadataDisplayItem[] | Promise<ClickMetadataDisplayItem[]>;
  getClickMetadataSearchFields?: (input: {
    state: PluginState;
    isAdmin: boolean;
    isOwner: boolean;
  }) => ClickMetadataSearchField[] | Promise<ClickMetadataSearchField[]>;
  outboundProxyProtocols?: PluginOutboundProxyProtocol[];
  resolveOutboundProxy?: (input: {
    url: URL;
    purpose: string;
    state: PluginState;
    settings: SiteSettings;
  }) =>
    | PluginOutboundProxyConfig
    | null
    | undefined
    | Promise<PluginOutboundProxyConfig | null | undefined>;
  handleOutboundProxyRequest?: (input: {
    url: URL;
    method: string;
    headers: Record<string, string>;
    body: Uint8Array;
    proxy: PluginOutboundProxyConfig;
    purpose: string;
    signal?: AbortSignal;
    timeoutMs: number;
    state: PluginState;
    settings: SiteSettings;
  }) =>
    | PluginOutboundProxyRequestResult
    | Promise<PluginOutboundProxyRequestResult>;
  handleOutboundProxyConnect?: (input: {
    host: string;
    port: number;
    secure: boolean;
    servername?: string;
    proxy: PluginOutboundProxyConfig;
    purpose: string;
    signal?: AbortSignal;
    timeoutMs: number;
    state: PluginState;
    settings: SiteSettings;
  }) => Socket | TLSSocket | Promise<Socket | TLSSocket>;
  publicConfig?: (config: PluginConfig) => PluginConfig;
  transformCreateUrl?: (url: URL, form: FormData, config: PluginConfig) => URL;
}

export interface PluginComponentProps {
  config: PluginConfig;
  locale?: SiteLocale;
  fallbackLocale?: SiteLocale;
  strings?: PluginLocaleStrings;
  user?: AuthenticatedUser | null;
  adminData?: unknown;
  item?: string;
  integrations?: PluginIntegrationData[];
  integrationData?: unknown;
}

export interface PluginIntegrationData {
  pluginId: string;
  pluginName: string;
  data: unknown;
}

export interface RegisteredPlugin {
  definition: PluginDefinition;
  admin: Component<PluginComponentProps> | null;
  adminSubpage: Component<PluginComponentProps> | null;
  slots: Partial<Record<PluginSlot, Component<PluginComponentProps>>>;
}
