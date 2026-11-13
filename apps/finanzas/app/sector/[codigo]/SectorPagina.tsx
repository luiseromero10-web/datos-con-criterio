"use client";
import { useParams } from "next/navigation";
import SectorVista from "@/components/SectorVista";

export default function SectorPagina() {
  const { codigo } = useParams<{ codigo: string }>();
  return <SectorVista codigo={decodeURIComponent(codigo ?? "").toUpperCase()} />;
}
