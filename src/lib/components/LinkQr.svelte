<script lang="ts">
  import { browser } from '$app/environment';
  import QRCode from 'qrcode';
  import { defaultSiteLocale, type SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  const SVG_CACHE_LIMIT = 120;
  const svgCache: Array<[string, string]> = [];

  function cachedSvg(value: string) {
    const index = svgCache.findIndex(([key]) => key === value);
    if (index < 0) return '';
    const [[, cached]] = svgCache.splice(index, 1);
    svgCache.push([value, cached]);
    return cached;
  }

  function rememberSvg(value: string, markup: string) {
    const index = svgCache.findIndex(([key]) => key === value);
    if (index >= 0) svgCache.splice(index, 1);
    svgCache.push([value, markup]);
    if (svgCache.length > SVG_CACHE_LIMIT) svgCache.shift();
  }

  let {
    value,
    code,
    brandName = 'Shortlink',
    accentColor = '#171717',
    locale = defaultSiteLocale,
  }: {
    value: string;
    code: string;
    brandName?: string;
    accentColor?: string;
    locale?: SiteLocale;
  } = $props();

  const text = $derived(uiText(locale));
  let svgMarkup = $state('');
  let busy = $state(false);
  let renderToken = 0;
  const svgDataUrl = $derived(
    svgMarkup
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
      : '',
  );

  async function renderQr(source: string) {
    if (!browser || !source) {
      svgMarkup = '';
      return;
    }

    const cached = cachedSvg(source);
    if (cached) {
      svgMarkup = cached;
      return;
    }

    const token = ++renderToken;
    const markup = await QRCode.toString(source, {
      type: 'svg',
      margin: 1,
      width: 192,
      color: {
        dark: '#111111',
        light: '#ffffff',
      },
    });
    if (token !== renderToken || source !== value) return;
    rememberSvg(source, markup);
    svgMarkup = markup;
  }

  $effect(() => {
    void renderQr(value);
  });

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadSvg() {
    if (!svgMarkup) return;
    downloadBlob(
      new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }),
      `${code}-qr.svg`,
    );
  }

  function imageFromDataUrl(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolveImage, reject) => {
      const image = new Image();
      image.onload = () => resolveImage(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  async function downloadPng() {
    if (!browser || busy) return;
    busy = true;
    try {
      const qrDataUrl = await QRCode.toDataURL(value, {
        margin: 1,
        width: 520,
        color: {
          dark: '#111111',
          light: '#ffffff',
        },
      });
      const qrImage = await imageFromDataUrl(qrDataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 860;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = accentColor;
      context.fillRect(0, 0, canvas.width, 18);
      context.fillStyle = '#111111';
      context.font = '700 34px system-ui, sans-serif';
      context.fillText(brandName.slice(0, 32), 70, 82);
      context.fillStyle = '#555555';
      context.font = '500 24px system-ui, sans-serif';
      context.fillText(`/${code}`.slice(0, 42), 70, 122);
      context.drawImage(qrImage, 100, 172, 520, 520);
      context.fillStyle = '#111111';
      context.font = '700 25px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(value.slice(0, 48), canvas.width / 2, 750);
      context.fillStyle = '#777777';
      context.font = '500 18px system-ui, sans-serif';
      context.fillText(text.common.scanToOpen, canvas.width / 2, 788);

      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${code}-qr-card.png`);
      }, 'image/png');
    } finally {
      busy = false;
    }
  }
</script>

<div class="qr-tool">
  <div class="qr-box" aria-label={`/${code} ${text.common.qrCode}`}>
    {#if svgDataUrl}
      <img src={svgDataUrl} alt="" />
    {/if}
  </div>
  <div class="qr-actions">
    <button type="button" onclick={downloadPng} disabled={busy}>
      {busy ? text.common.preparing : 'PNG'}
    </button>
    <button type="button" onclick={downloadSvg} disabled={!svgMarkup}
      >SVG</button
    >
  </div>
</div>

<style>
  .qr-tool {
    display: grid;
    gap: 8px;
  }
  .qr-box {
    display: grid;
    width: 104px;
    height: 104px;
    place-items: center;
    border: 1px solid var(--managed-link-border, var(--page-border, #d4d4d4));
    border-radius: 8px;
    padding: 6px;
    background: #fff;
  }
  .qr-box img {
    display: block;
    width: 100%;
    height: 100%;
  }
  .qr-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .qr-actions button {
    min-height: 30px;
    border: 1px solid var(--managed-link-border, var(--page-border, #d4d4d4));
    border-radius: 7px;
    background: var(--managed-link-surface, var(--page-surface, #fff));
    color: var(--managed-link-text, var(--page-text, #171717));
    font-size: 0.72rem;
    font-weight: 850;
    cursor: pointer;
  }
  .qr-actions button:disabled {
    cursor: wait;
    opacity: 0.6;
  }
</style>
