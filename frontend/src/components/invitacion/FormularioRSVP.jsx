import { useState } from 'react';
import { api } from '../../api';

export default function FormularioRSVP({
  token,
  invitado,
  confirmacionExistente,
  puedeConfirmar,
  onConfirmado,
}) {
  const maxAcompanantes = Number(invitado?.acompanantes_permitidos);
  const invitacionPersonal = !Number.isFinite(maxAcompanantes) || maxAcompanantes <= 0;
  const maxPermitido = invitacionPersonal ? 0 : Math.floor(maxAcompanantes);

  const [asistira, setAsistira] = useState(
    confirmacionExistente?.asistira ?? null
  );
  const [acompanantes, setAcompanantes] = useState(() => {
    if (invitacionPersonal) return 0;
    const prev = Number(confirmacionExistente?.numero_acompanantes) || 0;
    return Math.min(Math.max(0, prev), maxPermitido);
  });
  const [mensaje, setMensaje] = useState(confirmacionExistente?.mensaje ?? '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (asistira === null) {
      setError('Por favor selecciona si asistirás o no');
      return;
    }

    const numeroAcompanantes = asistira && !invitacionPersonal
      ? Math.min(Math.max(0, acompanantes), maxPermitido)
      : 0;

    setEnviando(true);
    try {
      const resultado = await api.confirmar(token, {
        asistira,
        numero_acompanantes: numeroAcompanantes,
        mensaje,
      });
      onConfirmado(resultado);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (!puedeConfirmar && !confirmacionExistente) {
    return (
      <section className="seccion">
        <div className="seccion-head">
          <p className="eyebrow">Confirmación</p>
          <h2 className="seccion-titulo">Confirmación cerrada</h2>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
          La fecha límite para confirmar asistencia ha pasado.
        </p>
      </section>
    );
  }

  return (
    <section className="seccion">
      <div className="seccion-head">
        <p className="eyebrow">Confirmación de asistencia</p>
        <h2 className="seccion-titulo">
          {confirmacionExistente ? 'Modifica tu respuesta' : 'Confirma tu asistencia'}
        </h2>
      </div>

      <form className="rsvp-form" onSubmit={handleSubmit}>
        <p className="rsvp-nombre">{invitado.nombre}</p>

        {invitacionPersonal && (
          <div className="rsvp-personal-note">
            <span className="rsvp-personal-icon">✦</span>
            <p className="rsvp-personal-title">Invitación personal</p>
            <p>
              Esta invitación es solo para ti. Por el aforo del evento,
              no es posible registrar acompañantes adicionales.
            </p>
          </div>
        )}

        <div className="form-group">
          <label>¿Podrás acompañarnos?</label>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="asistira"
                checked={asistira === true}
                onChange={() => {
                  setAsistira(true);
                  if (invitacionPersonal) setAcompanantes(0);
                }}
              />
              Sí, asistiré
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="asistira"
                checked={asistira === false}
                onChange={() => {
                  setAsistira(false);
                  setAcompanantes(0);
                }}
              />
              No podré asistir
            </label>
          </div>
        </div>

        {asistira && !invitacionPersonal && (
          <div className="form-group">
            <label>
              Número de acompañantes (máx. {maxPermitido})
            </label>
            <input
              type="number"
              className="form-input"
              min={0}
              max={maxPermitido}
              value={acompanantes}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10) || 0;
                setAcompanantes(Math.min(Math.max(0, value), maxPermitido));
              }}
            />
          </div>
        )}

        <div className="form-group">
          <label>Mensaje para la homenajeada</label>
          <textarea
            className="form-textarea"
            placeholder="Escribe un mensaje especial..."
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={enviando}
        >
          {enviando ? 'Enviando...' : 'Enviar respuesta'}
        </button>
      </form>
    </section>
  );
}
