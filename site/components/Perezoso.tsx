"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Monta el contenido solo cuando está cerca de la pantalla: así el mapa y el gráfico (los módulos más pesados) no frenan la carga inicial. */
export default function Perezoso({ children, alto, margen = "300px" }: { children: ReactNode; alto: string; margen?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ver, setVer] = useState(false);
  useEffect(() => {
    if (ver || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVer(true);
          io.disconnect();
        }
      },
      { rootMargin: margen },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ver, margen]);
  return (
    <div ref={ref}>
      {ver ? children : <div className={`grid place-items-center border border-rule text-sm text-ink2 ${alto}`}>Cargando…</div>}
    </div>
  );
}
