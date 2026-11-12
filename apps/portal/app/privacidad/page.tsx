import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Qué datos recoge Datos con Criterio, para qué y cómo pedir que se borren.",
};

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 max-w-prose">
      <h2 className="display border-t-2 border-ink pt-3 text-2xl">{titulo}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default function Privacidad() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
      <p className="eyebrow">Privacidad</p>
      <h1 className="display mt-3 text-4xl leading-[1.02] sm:text-6xl">Qué datos recogemos</h1>

      <p className="mt-6 max-w-prose border border-dashed border-rule p-4 text-ink2">
        <strong className="text-ink">Borrador pendiente de revisión del autor.</strong> Describe cómo se piensa operar el sitio cuando estén activas la analítica, los
        comentarios y el feedback (todavía no lo están). No es asesoría legal. Referencia: Ley 1581 de 2012 de protección de datos personales.
      </p>

      <Bloque titulo="Hoy">
        <p>
          El sitio solo muestra datos públicos y no pide ningún dato personal. No hay cuentas, no hay formularios y no se guarda nada sobre quién lo visita.
        </p>
      </Bloque>

      <Bloque titulo="Visitas y uso (cuando se active)">
        <p>
          Para saber cuánta gente usa cada herramienta se contarán las visitas con una analítica que no usa cookies ni almacenamiento local para rastrear, y los
          eventos de uso (por ejemplo, qué delito se filtra) se guardarán <strong>como conteos por día</strong>: sin dirección IP, sin identificador de visitante y sin
          poder reconstruir lo que hizo una persona.
        </p>
      </Bloque>

      <Bloque titulo="Comentarios (cuando se active)">
        <p>
          Quien comente indica un nombre, que puede ser un seudónimo, y su mensaje. Ambos se muestran públicamente una vez aprobados. No se pide correo. Para evitar
          el spam se usa una verificación que no identifica a la persona y se limita el número de envíos por día; no se guarda la dirección IP.
        </p>
      </Bloque>

      <Bloque titulo="Feedback (cuando se active)">
        <p>
          El mensaje de feedback es privado: solo lo ve el autor. Dejar un contacto es opcional y solo se guarda si se marca el consentimiento. Se usa únicamente para
          responder a esa persona.
        </p>
      </Bloque>

      <Bloque titulo="Cuánto tiempo y cómo pedir que se borre">
        <p>
          Los comentarios y el feedback se conservan mientras sean útiles para la herramienta. Quien quiera que se borre un comentario suyo o su contacto puede pedirlo
          al autor, con el enlace al comentario o con el mensaje que envió. Los datos de contacto de esa vía se publicarán aquí al cerrar esta página.
        </p>
      </Bloque>
    </div>
  );
}
