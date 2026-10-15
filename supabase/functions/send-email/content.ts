// Montagem do corpo do e-mail. Módulo puro (sem Deno) para poder ser testado
// no Vitest do app.

export const DEFAULT_APP_URL = "https://oxyve.vercel.app";

export interface EmailContentInput {
  subject: string;
  text?: string;
  html?: string;
  link?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Os links das notificações são gravados relativos ('/app/reports/<id>'), o
 * que serve ao push mas não ao e-mail. Monta a URL absoluta com APP_URL e só
 * aceita destino no próprio app (evita o e-mail virar redirecionador).
 */
export function resolveAppLink(link: string | null | undefined, appUrl: string): string | null {
  if (!link) return null;
  try {
    const base = new URL(appUrl);
    const url = new URL(link, base);
    if (url.origin !== base.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function buildEmailContent(
  input: EmailContentInput,
  appUrl: string,
): { text?: string; html: string } {
  const url = resolveAppLink(input.link, appUrl);
  const linkLine = url ? `Abrir no Oxy VE: ${url}` : "";

  const text = [input.text, linkLine].filter(Boolean).join("\n\n") || undefined;

  const button = url
    ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#3A3A3A;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Abrir no Oxy VE</a></p>` +
      `<p style="font-size:12px;color:#666">Ou copie o endereço: ${escapeHtml(url)}</p>`
    : "";

  if (input.html) {
    return { text, html: input.html + button };
  }

  const body = escapeHtml(input.text ?? "").replace(/\n/g, "<br>");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.5">` +
    `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(input.subject)}</h2>` +
    (body ? `<p style="margin:0">${body}</p>` : "") +
    button +
    `</div>`;
  return { text, html };
}
