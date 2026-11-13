"use client";
import { useBase } from "@/lib/usar";
import { fechaCorta } from "@/lib/format";

/**
 * Aviso permanente (plan 0.2): lo que se publica es lo que las sociedades reportaron a la Supersociedades, no es asesoría financiera ni
 * calificación de riesgo. Cita la fuente, su fecha y la licencia (CC BY-SA 4.0).
 */
export default function Aviso() {
  const base = useBase();
  const meta = base.estado === "listo" ? base.datos.meta : null;
  return (
    <section className="mt-14 rule-top pt-3" aria-label="Fuente, licencia y aviso">
      <p className="mono text-sm">
        {meta ? `Datos construidos el ${fechaCorta(meta.generado)} · cierres ${Math.min(...meta.anios)}–${Math.max(...meta.anios)} · ${meta.filas.estados.toLocaleString("es-CO")} estados financieros` : "Cargando la fecha de los datos…"}
      </p>
      <p className="mt-1 text-sm text-ink2">
        <strong>Información reportada por las sociedades a la Superintendencia de Sociedades. No es asesoría financiera ni calificación de riesgo.</strong> Las cifras son
        las que cada sociedad presentó y pueden contener errores de digitación de la fuente. Fuente: Superintendencia de Sociedades, estados financieros NIIF en datos.gov.co; IPC y CIIU del DANE.
        Licencia Creative Commons Atribución-CompartirIgual 4.0 (CC BY-SA 4.0): puede reutilizar los datos citando la fuente y compartiendo lo derivado con la misma licencia.
      </p>
    </section>
  );
}
