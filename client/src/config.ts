declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?: string;
  };
};

const configured = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export const apiBaseUrl = configured.replace(/\/$/, '');

export const sessionCookieName = 'JSESSIONID';

// EXPO_PUBLIC_ values ship inside the app, so only a public pk. token is accepted.
const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? '';

export const mapboxAccessToken = mapboxToken.startsWith('pk.') ? mapboxToken : null;

// Mapbox takes [longitude, latitude], the reverse of how the API speaks.
export const stevensCenter: [number, number] = [-74.0256, 40.7448];
