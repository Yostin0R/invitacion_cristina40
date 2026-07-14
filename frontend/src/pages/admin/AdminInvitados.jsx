import { useState, useEffect } from 'react';
import { api } from '../../api';
import { generarEnlaceWhatsApp } from '../../utils/dates';
import { IconLink, IconWhatsapp, IconEdit, IconTrash, IconPlus } from '../../components/icons';

const ESTADO_LABELS = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente',
  no_asiste: 'No asistirá',
};

export default function AdminInvitados() {
  const [invitados, setInvitados] = useState([]);
  const [todos, setTodos] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nuevoInvitado, setNuevoInvitado] = useState({ nombre: '', telefono: '', acompanantes_permitidos: 2 });
  const [enlaceCreado, setEnlaceCreado] = useState('');
  const [editando, setEditando] = useState(null);

  const cargarInvitados = () => {
    const params = {};
    if (buscar) params.buscar = buscar;
    if (filtroEstado) params.estado = filtroEstado;
    api.getInvitados(params).then(setInvitados).catch(console.error);
  };

  const cargarTodos = () => api.getInvitados().then(setTodos).catch(console.error);

  useEffect(() => { cargarInvitados(); }, [buscar, filtroEstado]);
  useEffect(() => { cargarTodos(); }, []);

  const conteo = {
    total: todos.length,
    confirmado: todos.filter((i) => i.estado_invitado === 'confirmado').length,
    pendiente: todos.filter((i) => i.estado_invitado === 'pendiente').length,
    no_asiste: todos.filter((i) => i.estado_invitado === 'no_asiste').length,
  };

  const refrescar = () => { cargarInvitados(); cargarTodos(); };

  const copiarEnlace = (token) => {
    navigator.clipboard.writeText(`${window.location.origin}/invitacion/${token}`);
    alert('Enlace copiado al portapapeles');
  };

  const enviarWhatsApp = (inv) => {
    const enlace = `${window.location.origin}/invitacion/${inv.token_invitacion}`;
    const mensaje = `¡Hola ${inv.nombre}! Tienes una invitación especial para el cumpleaños. Ábrela aquí: ${enlace}`;
    window.open(generarEnlaceWhatsApp(inv.telefono, mensaje), '_blank');
  };

  const crearInvitado = async (e) => {
    e.preventDefault();
    try {
      const resultado = await api.crearInvitado(nuevoInvitado);
      setEnlaceCreado(resultado.enlace);
      setNuevoInvitado({ nombre: '', telefono: '', acompanantes_permitidos: 2 });
      refrescar();
    } catch (err) {
      alert(err.message);
    }
  };

  const eliminarInvitado = async (id, nombre) => {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return;
    try {
      await api.eliminarInvitado(id);
      refrescar();
    } catch (err) {
      alert(err.message);
    }
  };

  const abrirEdicion = (inv) => {
    setEditando({
      id_invitado: inv.id_invitado,
      nombre: inv.nombre,
      telefono: inv.telefono || '',
      acompanantes_permitidos: inv.acompanantes_permitidos,
      marcarConfirmacion: inv.estado_invitado !== 'pendiente',
      asistira: inv.asistira === null ? true : inv.asistira,
      numero_acompanantes: inv.numero_acompanantes ?? 0,
    });
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      const body = {
        nombre: editando.nombre,
        telefono: editando.telefono,
        acompanantes_permitidos: editando.acompanantes_permitidos,
      };
      if (editando.marcarConfirmacion) {
        body.asistira = editando.asistira;
        body.numero_acompanantes = editando.asistira ? editando.numero_acompanantes : 0;
      }
      await api.actualizarInvitado(editando.id_invitado, body);
      setEditando(null);
      refrescar();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Gestión de Invitados</h1>
          <p className="sub">Administra la lista y confirmaciones</p>
        </div>
        <div className="admin-header-actions">
          <button className="btn btn-primary btn-small" onClick={() => setMostrarForm(!mostrarForm)}>
            <IconPlus width="15" height="15" /> {mostrarForm ? 'Cerrar' : 'Nuevo invitado'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="lbl">Total</div><div className="num">{conteo.total}</div></div>
        <div className="stat-card"><div className="lbl">Confirmados</div><div className="num" style={{ color: '#1E7E42' }}>{conteo.confirmado}</div></div>
        <div className="stat-card"><div className="lbl">Pendientes</div><div className="num" style={{ color: '#A67908' }}>{conteo.pendiente}</div></div>
        <div className="stat-card"><div className="lbl">No asistirán</div><div className="num" style={{ color: '#B03A4A' }}>{conteo.no_asiste}</div></div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-toolbar">
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="confirmado">Confirmados</option>
            <option value="pendiente">Pendientes</option>
            <option value="no_asiste">No asistirán</option>
          </select>
        </div>

        {mostrarForm && (
          <form onSubmit={crearInvitado} style={{ padding: '16px', borderBottom: '1px solid var(--line)', background: 'var(--cream)' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="form-input" placeholder="Nombre" value={nuevoInvitado.nombre}
                onChange={(e) => setNuevoInvitado({ ...nuevoInvitado, nombre: e.target.value })} required style={{ flex: 1, minWidth: '150px' }} />
              <input className="form-input" placeholder="Teléfono" value={nuevoInvitado.telefono}
                onChange={(e) => setNuevoInvitado({ ...nuevoInvitado, telefono: e.target.value })} style={{ flex: 1, minWidth: '120px' }} />
              <input
                className="form-input"
                type="number"
                min={0}
                max={10}
                title="Acompañantes adicionales (0 = solo el invitado)"
                placeholder="Acomp. (0=solo)"
                value={nuevoInvitado.acompanantes_permitidos}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === '' ? 0 : parseInt(raw, 10);
                  setNuevoInvitado({
                    ...nuevoInvitado,
                    acompanantes_permitidos: Number.isFinite(n) && n >= 0 ? n : 0,
                  });
                }}
                style={{ width: '150px' }}
              />
              <button type="submit" className="btn btn-primary btn-small">Crear</button>
            </div>
            {enlaceCreado && (
              <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--burgundy)', wordBreak: 'break-all' }}>
                Enlace creado: {enlaceCreado}
              </p>
            )}
          </form>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acompañantes</th>
                <th>Fecha respuesta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invitados.map((inv) => (
                <tr key={inv.id_invitado}>
                  <td>
                    <strong>{inv.nombre}</strong>
                    {inv.telefono && <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{inv.telefono}</div>}
                  </td>
                  <td><span className={`badge badge-${inv.estado_invitado}`}>{ESTADO_LABELS[inv.estado_invitado]}</span></td>
                  <td>
                    {inv.estado_invitado === 'confirmado'
                      ? `${inv.numero_acompanantes ?? 0} (máx. ${inv.acompanantes_permitidos})`
                      : Number(inv.acompanantes_permitidos) <= 0
                        ? 'Solo el invitado'
                        : `${inv.acompanantes_permitidos} permitidos`}
                  </td>
                  <td>{inv.fecha_confirmacion ? new Date(inv.fecha_confirmacion).toLocaleDateString('es-ES') : '—'}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="icon-action" title="Editar" onClick={() => abrirEdicion(inv)}><IconEdit /></button>
                      <button className="icon-action" title="Copiar enlace" onClick={() => copiarEnlace(inv.token_invitacion)}><IconLink /></button>
                      {inv.telefono && <button className="icon-action" title="WhatsApp" onClick={() => enviarWhatsApp(inv)}><IconWhatsapp width="15" height="15" /></button>}
                      <button className="icon-action" title="Eliminar" onClick={() => eliminarInvitado(inv.id_invitado, inv.nombre)} style={{ color: '#B03A4A' }}><IconTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {invitados.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '30px' }}>No hay invitados que coincidan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={guardarEdicion}>
            <div className="panel-title">Editar invitado</div>

            <div className="form-group">
              <label>Nombre</label>
              <input className="form-input" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input className="form-input" value={editando.telefono} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Acompañantes adicionales permitidos</label>
              <input
                className="form-input"
                type="number"
                min={0}
                max={10}
                value={editando.acompanantes_permitidos}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === '' ? 0 : parseInt(raw, 10);
                  const max = Number.isFinite(n) && n >= 0 ? n : 0;
                  setEditando({
                    ...editando,
                    acompanantes_permitidos: max,
                    numero_acompanantes: Math.min(editando.numero_acompanantes || 0, max),
                  });
                }}
              />
              <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                {Number(editando.acompanantes_permitidos) <= 0
                  ? 'Invitación personal: solo esa persona, sin acompañantes.'
                  : `Puede llevar hasta ${editando.acompanantes_permitidos} acompañante(s) además de sí misma/o.`}
              </p>
            </div>

            <div className="form-group">
              <label className="radio-option" style={{ border: 'none', padding: 0 }}>
                <input type="checkbox" checked={editando.marcarConfirmacion}
                  onChange={(e) => setEditando({ ...editando, marcarConfirmacion: e.target.checked })} />
                Marcar confirmación manualmente
              </label>
            </div>

            {editando.marcarConfirmacion && (
              <>
                <div className="form-group">
                  <label>Respuesta</label>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input type="radio" name="edit-asistira" checked={editando.asistira === true}
                        onChange={() => setEditando({ ...editando, asistira: true })} />
                      Asistirá
                    </label>
                    <label className="radio-option">
                      <input type="radio" name="edit-asistira" checked={editando.asistira === false}
                        onChange={() => setEditando({ ...editando, asistira: false, numero_acompanantes: 0 })} />
                      No asistirá
                    </label>
                  </div>
                </div>
                {editando.asistira && Number(editando.acompanantes_permitidos) > 0 && (
                  <div className="form-group">
                    <label>Número de acompañantes confirmados</label>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      max={editando.acompanantes_permitidos}
                      value={editando.numero_acompanantes}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === '' ? 0 : parseInt(raw, 10);
                        const value = Number.isFinite(n) && n >= 0 ? n : 0;
                        setEditando({
                          ...editando,
                          numero_acompanantes: Math.min(value, editando.acompanantes_permitidos),
                        });
                      }}
                    />
                  </div>
                )}
                {editando.asistira && Number(editando.acompanantes_permitidos) <= 0 && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '12px' }}>
                    Como es invitación personal, se confirmará sin acompañantes.
                  </p>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
