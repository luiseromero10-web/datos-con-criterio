"use client";
import { useParams } from "next/navigation";
import Ficha from "@/components/Ficha";

export default function FichaPagina() {
  const { nit } = useParams<{ nit: string }>();
  return <Ficha nit={nit} />;
}
