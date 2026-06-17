import api from '../services/api';

let cache: Record<string, string> | null = null;

export const getCompanySettings = async (): Promise<Record<string, string>> => {
  if (cache) return cache;
  try {
    const { data } = await api.get('/settings');
    cache = data.data || {};
  } catch {
    cache = {};
  }
  return cache!;
};

export const clearCompanySettingsCache = () => {
  cache = null;
};
