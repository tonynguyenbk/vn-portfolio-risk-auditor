"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Export control for the report (PRD 14.5). The MVP prints from the browser
 * rather than generating a PDF server-side, which PRD 16.3 explicitly allows
 * so that reporting does not block on PDF tooling.
 */
export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()} className="no-print">
      <Printer aria-hidden="true" className="h-4 w-4" />
      Print or save as PDF
    </Button>
  );
}
