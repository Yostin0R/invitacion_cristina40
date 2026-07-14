const rawApiUrl = import.meta.env.VITE_API_URL;

if (!rawApiUrl) {
  console.error(
    '[API] Falta VITE_API_URL. En Vercel agrega la variable de entorno con la URL de Render (sin barra final) y vuelve a desplegar.'
  );
}

const API_BASE = `${String(rawApiUrl || '').replace(/\/$/, '')}/api`;

async function request(url, options = {}) {
  if (!rawApiUrl && import.meta.env.PROD) {
    throw new Error(
      'Configura VITE_API_URL en Vercel con la URL de tu backend en Render y redespliega'
    );
  }

  const token = localStorage.getItem('admin_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

export const api = {
  getInvitacion: (token) => request(`/invitaciones/${token}`),
  confirmar: (token, body) =>
    request(`/invitaciones/${token}/confirmar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (correo, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, password }),
    }),
  getEstadisticas: () => request('/admin/estadisticas'),
  getInvitados: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/admin/invitados${query ? `?${query}` : ''}`);
  },
  crearInvitado: (body) =>
    request('/admin/invitados', { method: 'POST', body: JSON.stringify(body) }),
  actualizarInvitado: (id, body) =>
    request(`/admin/invitados/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  eliminarInvitado: (id) =>
    request(`/admin/invitados/${id}`, { method: 'DELETE' }),
  getEvento: () => request('/admin/evento'),
  actualizarEvento: (body) =>
    request('/admin/evento', { method: 'PUT', body: JSON.stringify(body) }),
  eliminarFotografia: (id) =>
    request(`/admin/fotografias/${id}`, { method: 'DELETE' }),
  getMensajes: () => request('/admin/mensajes'),
  exportar: (formato = 'csv') => {
    if (!rawApiUrl && import.meta.env.PROD) {
      return Promise.reject(
        new Error('Configura VITE_API_URL en Vercel con la URL de tu backend en Render y redespliega')
      );
    }
    const token = localStorage.getItem('admin_token');
    return fetch(`${API_BASE}/admin/exportar?formato=${formato}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
