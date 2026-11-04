/** Forma de cualquier error de la API (RFC 9457), devuelta por `ProblemDetailsFilter`. Solo para documentación en Swagger. */
export class ProblemDetailsDto {
  /** URI que identifica el tipo de problema (coincide con el status HTTP). */
  type!: string;

  /** Título corto y legible del tipo de error. */
  title!: string;

  /** Código de estado HTTP, repetido en el body. */
  status!: number;

  /** Descripción puntual del error, cuando no es una lista de validaciones. */
  detail?: string;

  /** Path del request que generó el error. */
  instance!: string;

  /** Errores puntuales: mensajes de validación por campo, o indicadores de salud caídos. */
  errors?: string[];
}
