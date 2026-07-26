"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Play } from "lucide-react";
import { useAnalysisParams } from "@/components/analysis-params-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Eyebrow } from "@/components/ui/panel";
import { MODEL_LABELS, type ConfidenceLevel, type VarModel } from "@/types/analysis";
import { cn } from "@/lib/utils";

const MODELS: VarModel[] = ["historical", "parametric_normal", "ewma_normal"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-b-0">
      <Eyebrow className="mb-3 block">{title}</Eyebrow>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * Left analysis rail (PRD 13.6). Every control here maps to a row of the
 * user-input table in PRD 10.1.
 */
export function ControlRail() {
  const { params, setParams, toggleModel, runState, runAnalysis, validation } =
    useAnalysisParams();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const calculating = runState === "calculating";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <Section title="Dataset">
          <Field label="Source">
            {(id) => (
              <Select
                id={id}
                value={params.dataset}
                onChange={(e) =>
                  setParams({ dataset: e.target.value as "demo" | "upload" })
                }
              >
                <option value="demo">Bundled demo (simulated)</option>
                <option value="upload" disabled>
                  Upload CSV — available in a later phase
                </option>
              </Select>
            )}
          </Field>
        </Section>

        <Section title="Portfolio">
          <Field
            label="Preset"
            hint="Five fictional tickers with fixed long-only weights summing to 100%."
          >
            {(id) => (
              <Select id={id} defaultValue="demo5">
                <option value="demo5">Five-asset demonstration portfolio</option>
              </Select>
            )}
          </Field>
        </Section>

        <Section title="Date range">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={params.startDate}
                  onChange={(e) => setParams({ startDate: e.target.value })}
                />
              )}
            </Field>
            <Field label="End">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={params.endDate}
                  onChange={(e) => setParams({ endDate: e.target.value })}
                />
              )}
            </Field>
          </div>
        </Section>

        <Section title="Confidence">
          <SegmentedControl<ConfidenceLevel>
            label="Confidence level"
            value={params.confidence}
            onChange={(confidence) => setParams({ confidence })}
            options={[
              { value: 0.95, label: "95%" },
              { value: 0.99, label: "99%" },
            ]}
          />
        </Section>

        <Section title="Rolling window">
          <Field label="Observations" hint="Trading days used to estimate each forecast.">
            {(id) => (
              <Select
                id={id}
                value={params.rollingWindow}
                onChange={(e) => setParams({ rollingWindow: Number(e.target.value) })}
              >
                {[125, 250, 500].map((w) => (
                  <option key={w} value={w}>
                    {w} days
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Section>

        <Section title="Model">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">VaR models to evaluate</legend>
            {MODELS.map((model) => (
              <label
                key={model}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] text-ink-secondary hover:text-ink"
              >
                <input
                  type="checkbox"
                  checked={params.models.includes(model)}
                  onChange={() => toggleModel(model)}
                  className="h-4 w-4 shrink-0 accent-[var(--aqua)]"
                />
                {MODEL_LABELS[model]}
              </label>
            ))}
          </fieldset>
        </Section>

        <Section title="Advanced assumptions">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="flex min-h-9 items-center justify-between rounded-md text-[13px] text-ink-secondary hover:text-ink"
          >
            {advancedOpen ? "Hide" : "Show"} advanced settings
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-4 w-4 transition-transform duration-150",
                advancedOpen && "rotate-180",
              )}
            />
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-3 pt-1">
              <Field label="EWMA lambda" hint="Decay factor. RiskMetrics convention is 0.94.">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="0.99"
                    value={params.ewmaLambda}
                    onChange={(e) => setParams({ ewmaLambda: Number(e.target.value) })}
                  />
                )}
              </Field>

              <Field label="Benchmark">
                {(id) => (
                  <Select
                    id={id}
                    value={params.benchmark}
                    onChange={(e) => setParams({ benchmark: e.target.value })}
                  >
                    <option value="VNINDEX">VNINDEX</option>
                    <option value="">None</option>
                  </Select>
                )}
              </Field>

              <Field
                label="Simulated notional"
                hint="Optional. Leave empty to report risk as a percentage only."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    placeholder="Not set"
                    value={params.notionalValue ?? ""}
                    onChange={(e) =>
                      setParams({
                        notionalValue: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                )}
              </Field>
            </div>
          )}
        </Section>
      </div>

      {/* Run control is pinned so it stays reachable on a long rail. */}
      <div className="border-t border-line bg-bg-elevated p-4">
        {validation.errors.length > 0 && (
          <div
            role="alert"
            className="mb-3 flex gap-2 rounded-md border border-coral/40 bg-[var(--coral-soft)] p-2.5"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
            <ul className="flex flex-col gap-1 text-[12px] leading-snug text-ink-secondary">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {validation.errors.length === 0 && validation.warnings.length > 0 && (
          <div className="mb-3 flex gap-2 rounded-md border border-amber/40 bg-amber/10 p-2.5">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <ul className="flex flex-col gap-1 text-[12px] leading-snug text-ink-secondary">
              {validation.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <Button
          variant="primary"
          className="w-full"
          onClick={runAnalysis}
          disabled={!validation.canRun || calculating}
        >
          {calculating ? (
            <>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              Calculating…
            </>
          ) : (
            <>
              <Play aria-hidden="true" className="h-4 w-4" />
              Run analysis
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
