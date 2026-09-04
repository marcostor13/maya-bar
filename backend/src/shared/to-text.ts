/**
 * Convierte cualquier valor a texto, exactamente como lo haría `String(value)`.
 *
 * Existe porque `no-base-to-string` avisa —con razón— de que un objeto sin
 * `toString` propio termina como `[object Object]`. En los parsers de
 * importación y en la normalización de teléfonos ese es justo el comportamiento
 * buscado: el dato viene de un CSV, un Excel o un JSON ajeno, y lo que valga
 * `String()` es lo que hay que guardar (un ObjectId da su hex, una fecha su ISO,
 * y un objeto opaco delata que la columna no era la que se esperaba). Al pasar
 * por aquí esa decisión queda escrita en un solo sitio en vez de repetida.
 */
export function toText(value: unknown): string {
  return String(value);
}
