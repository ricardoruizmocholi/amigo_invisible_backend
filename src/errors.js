export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Express solo reconoce un manejador de errores si declara los cuatro parámetros.
export function errorHandler(error, req, res, next) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, ...(error.details && { details: error.details }) });
    return;
  }
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: 'La petición es demasiado grande.' });
    return;
  }

  console.error(error);
  res.status(500).json({ error: 'Ha fallado algo en el servidor. Inténtalo de nuevo.' });
}
