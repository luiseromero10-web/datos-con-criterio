import { entradaIndice } from "@/lib/articulo-meta";
import { listarArticulos } from "@/lib/articulos";

// Índice estático que leen las apps (<ArticulosRelacionados>) por estar en el mismo dominio. Se genera en el build.
export async function GET() {
  const articulos = (await listarArticulos()).map(entradaIndice);
  return Response.json({ articulos }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
