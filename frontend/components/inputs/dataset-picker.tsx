"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, RotateCcw } from "lucide-react";
import { useAnalysisData } from "@/components/analysis-data-provider";
import { useAnalysisParams } from "@/components/analysis-params-provider";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { DEFAULT_LIMITS } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

/**
 * Dataset selection and CSV upload (PRD 8.1, 8.2, 15.1).
 *
 * Files are handed straight to the API and never stored anywhere on the client
 * beyond the lifetime of the request, matching the rule in PRD 17 that
 * portfolio data is not retained.
 */
export function DatasetPicker() {
  const { params, setParams } = useAnalysisParams();
  const { source, uploadState, error, runUpload, resetToDemo } = useAnalysisData();

  const marketRef = useRef<HTMLInputElement>(null);
  const portfolioRef = useRef<HTMLInputElement>(null);
  const [marketFile, setMarketFile] = useState<File | null>(null);
  const [portfolioFile, setPortfolioFile] = useState<File | null>(null);

  const uploading = uploadState === "uploading";
  const ready = marketFile !== null && portfolioFile !== null;

  const onAnalyse = async () => {
    if (!ready) return;
    await runUpload(marketFile, portfolioFile, params, DEFAULT_LIMITS);
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Source">
        {(id) => (
          <Select
            id={id}
            value={params.dataset}
            onChange={(e) => {
              const next = e.target.value as "demo" | "upload";
              setParams({ dataset: next });
              if (next === "demo") resetToDemo();
            }}
          >
            <option value="demo">Bundled demo (simulated)</option>
            <option value="upload">Upload CSV</option>
          </Select>
        )}
      </Field>

      {params.dataset === "upload" && (
        <div className="flex flex-col gap-2">
          <FilePicker
            label="Market data"
            hint="Long form: date, ticker, close"
            file={marketFile}
            inputRef={marketRef}
            onSelect={setMarketFile}
          />
          <FilePicker
            label="Portfolio"
            hint="ticker, weight, sector"
            file={portfolioFile}
            inputRef={portfolioRef}
            onSelect={setPortfolioFile}
          />

          <Button
            variant="primary"
            className="w-full"
            onClick={onAnalyse}
            disabled={!ready || uploading}
          >
            {uploading ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Analysing…
              </>
            ) : (
              <>
                <FileUp aria-hidden="true" className="h-4 w-4" />
                Analyse uploaded files
              </>
            )}
          </Button>

          {uploading && (
            <p className="text-[11px] leading-snug text-ink-muted">
              The analysis service may take up to a minute to wake if it has been idle.
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="flex gap-2 rounded-md border border-coral/40 bg-[var(--coral-soft)] p-2.5"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-coral"
              />
              <div className="flex flex-col gap-1 text-[12px] leading-snug text-ink-secondary">
                <span>{error.message}</span>
                {error.issues.length > 0 && (
                  <ul className="flex list-disc flex-col gap-0.5 pl-4">
                    {error.issues.map((issue) => (
                      <li key={issue.code + issue.message}>{issue.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {source === "upload" && uploadState === "complete" && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                resetToDemo();
                setParams({ dataset: "demo" });
              }}
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Back to bundled demo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FilePicker({
  label,
  hint,
  file,
  inputRef,
  onSelect,
}: {
  label: string;
  hint: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (file: File | null) => void;
}) {
  const inputId = `file-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        className={cn(
          "min-h-10 w-full rounded-md border border-line bg-bg px-2 py-2 text-[12px] text-ink-secondary",
          "file:mr-2 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1",
          "file:text-[11px] file:text-ink-secondary hover:border-line-strong",
        )}
      />
      <p className="text-[11px] text-ink-muted">
        {file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : hint}
      </p>
    </div>
  );
}
