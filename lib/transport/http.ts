
import {diagnosticRequest, diagnosticSource, measuredTransport} from '../transport-diagnostics';

import {transportApiBase} from '../transport-runtime';

import {Capacitor, CapacitorHttp} from '@capacitor/core';

import {withRequestDeadline} from '../request-deadline';

import {TRANSPORT_API_BASE_URL} from '../transport/endpoints';

const isWidgetRunner = () => typeof window !== 'undefined' && Boolean((window as any).NativeWidget);

const isNative = () => Capacitor.isNativePlatform() || isWidgetRunner();

const EINFO_DIRECT = 'http://einfo.zgpks.rzeszow.pl/api';

function einfoFallbackUrl(pathAndOptionalQuery: string) {
  const trimmed = pathAndOptionalQuery.replace(/^\//, '');
  return `${EINFO_DIRECT}/${trimmed}`;
}

async function requestJson<T>(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  const diagnostic=diagnosticRequest(url);
  const load=()=>withRequestDeadline((signal) => requestJsonImpl<T>(url, { ...init, signal }), init?.signal || undefined);
  return diagnostic?measuredTransport(diagnostic.provider,diagnostic.kind,load,value=>diagnosticCount(url,value),undefined,'request',diagnosticSource(url)):load();
}

async function requestJsonImpl<T>(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  if (isNative() && !isWidgetRunner()) {
    let data: unknown;
    if (typeof init?.body === 'string' && init.body) {
      try {
        data = JSON.parse(init.body);
      } catch {
        data = init.body;
      }
    }
    const response = await CapacitorHttp.request({
      url,
      method: init?.method || 'GET',
      headers: init?.headers,
      data,
      connectTimeout: 12000,
      readTimeout: 12000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw transportHttpError(response.status, response.data);
    }

    if (typeof response.data === 'string') {
      try {
        return JSON.parse(response.data) as T;
      } catch {
        throw new Error(`Invalid JSON (HTTP ${response.status}): ${response.data.slice(0, 120)}`);
      }
    }

    return response.data as T;
  }

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
  });

  const text = await response.text();
  if (!response.ok) {
    throw transportHttpError(response.status, text);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON (HTTP ${response.status}): ${text.slice(0, 120)}`);
  }
}

async function requestEinfoJson<T>(pathAndOptionalQuery: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<T> {
  return requestJson<T>(isNative() ? einfoFallbackUrl(pathAndOptionalQuery) : '/api/pks/einfo/' + pathAndOptionalQuery, init);
}

async function requestText(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<string> {
  const load=()=>withRequestDeadline((signal) => requestTextImpl(url, { ...init, signal }), init?.signal || undefined);
  const diagnostic=diagnosticRequest(url);
  return diagnostic?measuredTransport(diagnostic.provider,diagnostic.kind,load,undefined,undefined,'request',diagnosticSource(url)):load();
}

async function requestTextImpl(url: string, init?: RequestInit & {headers?: Record<string, string>}): Promise<string> {
  if (isNative() && !isWidgetRunner()) {
    const response = await CapacitorHttp.request({
      url,
      method: init?.method || 'GET',
      headers: init?.headers,
      connectTimeout: 12000,
      readTimeout: 12000,
    });

    if (response.status < 200 || response.status >= 300) {
      throw transportHttpError(response.status, response.data);
    }

    return typeof response.data === 'string' ? response.data : String(response.data || '');
  }

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    throw transportHttpError(response.status, text);
  }
  return text;
}

function transportApiUrl(path: string, searchParams?: URLSearchParams) {
  const basePath = path.startsWith('/') ? path : `/${path}`;
  const query = searchParams && Array.from(searchParams.keys()).length > 0 ? `?${searchParams.toString()}` : '';
  return `${transportApiBase(TRANSPORT_API_BASE_URL)}${basePath}${query}`;
}

export {isWidgetRunner};
export {isNative};
export {EINFO_DIRECT};
export {einfoFallbackUrl};
export {requestJson};
export {requestJsonImpl};
export {requestEinfoJson};
export {requestText};
export {requestTextImpl};
export {transportApiUrl};

function transportHttpError(status:number,body:unknown){
  const raw=typeof body==='string'?body:body&&typeof body==='object'?JSON.stringify(body):'';
  const hint=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,240);
  const reason=status===403?'Odmowa dostępu (nie dowodzi blokady urządzenia)':status===429?'Limit zapytań':status===404?'Nie znaleziono adresu API':status>=500?'Błąd serwera przewoźnika':'Błąd odpowiedzi API';
  return new Error(`HTTP ${status}: ${reason}${hint?' — '+hint:''}`);
}

function diagnosticCount(url:string,value:unknown){
  if(Array.isArray(value))return value.length;
  if(/[?&]type=mpk(?:&|$)/.test(url)&&value&&typeof value==='object'){
    return Object.values(value).filter(row=>row&&typeof row==='object'&&'x' in row&&'y' in row).length;
  }
  return undefined;
}
