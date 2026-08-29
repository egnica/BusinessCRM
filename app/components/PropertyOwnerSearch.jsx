"use client";

import { useMemo, useState } from "react";
import styles from "../page.module.css";

const GEOGRAPHY_OPTIONS = [
  ["all", "All Twin Cities Metro"],
  ["Hennepin", "Hennepin County"],
  ["Ramsey", "Ramsey County"],
  ["Dakota", "Dakota County"],
  ["Anoka", "Anoka County"],
  ["Washington", "Washington County"],
  ["Scott", "Scott County"],
  ["Carver", "Carver County"],
];

const SIZE_OPTIONS = [
  { value: "2-4", label: "2–4 units", minUnits: "2", maxUnits: "4" },
  { value: "2-8", label: "2–8 units", minUnits: "2", maxUnits: "8" },
  { value: "2-20", label: "2–20 units", minUnits: "2", maxUnits: "20" },
];

const DEFAULT_FILTERS = {
  geography: "all",
  propertySize: "2-4",
  minUnits: "2",
  maxUnits: "4",
  minPortfolioSize: "",
  maxPortfolioSize: "",
};

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ownerTypeLabel(value) {
  if (value === "llc") return "LLC / Entity";
  if (value === "couple") return "Couple";
  return "Individual";
}

function formatLocations(prospect) {
  const locations = prospect.locations || [];
  if (!locations.length) return "—";

  const visible = locations.slice(0, 3);
  const remaining = locations.length - visible.length;

  return visible.join(", ") + (remaining > 0 ? ` +${remaining}` : "");
}

function buildSearchParams(filters, page) {
  return new URLSearchParams({
    geography: filters.geography,
    minUnits: filters.minUnits,
    maxUnits: filters.maxUnits,
    minPortfolioSize: filters.minPortfolioSize,
    maxPortfolioSize: filters.maxPortfolioSize,
    page: String(page),
    pageSize: "25",
  });
}

export default function PropertyOwnerSearch({ onSaved }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [data, setData] = useState({
    prospects: [],
    total: 0,
    page: 1,
    totalPages: 1,
    sourcePropertyCount: 0,
    searchedCounties: [],
  });

  function handlePropertySizeChange(value) {
    const option = SIZE_OPTIONS.find((item) => item.value === value);
    if (!option) return;

    setFilters((current) => ({
      ...current,
      propertySize: option.value,
      minUnits: option.minUnits,
      maxUnits: option.maxUnits,
    }));
  }

  async function runSearch(page, activeFilters) {
    const minPortfolio = Number(activeFilters.minPortfolioSize);
    const maxPortfolio = Number(activeFilters.maxPortfolioSize);

    if (
      activeFilters.minPortfolioSize !== "" &&
      activeFilters.maxPortfolioSize !== "" &&
      Number.isFinite(minPortfolio) &&
      Number.isFinite(maxPortfolio) &&
      minPortfolio > maxPortfolio
    ) {
      setMessage("Portfolio minimum cannot be greater than the maximum.");
      return;
    }

    setSearchLoading(true);
    setMessage("");
    setSelectedKeys(new Set());

    try {
      const params = buildSearchParams(activeFilters, page);
      const res = await fetch(
        "/api/property-owners?" + params.toString(),
        { cache: "no-store" },
      );
      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          result.details || result.error || "Property owner search failed.",
        );
      }

      setData({
        prospects: result.prospects || [],
        total: result.total || 0,
        page: result.page || 1,
        totalPages: result.totalPages || 1,
        sourcePropertyCount: result.sourcePropertyCount || 0,
        searchedCounties: result.searchedCounties || [],
      });
      setAppliedFilters({ ...activeFilters });
      setHasSearched(true);
    } catch (error) {
      setHasSearched(true);
      setData({
        prospects: [],
        total: 0,
        page: 1,
        totalPages: 1,
        sourcePropertyCount: 0,
        searchedCounties: [],
      });
      setMessage(error.message || "Property owner search failed.");
    } finally {
      setSearchLoading(false);
    }
  }

  function toggleResult(key) {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }

  const selectablePageKeys = useMemo(
    () =>
      data.prospects
        .filter((prospect) => !prospect.saved && !prospect.inCrm)
        .map((prospect) => prospect.propertyOutreachKey),
    [data.prospects],
  );

  const allPageSelected =
    selectablePageKeys.length > 0 &&
    selectablePageKeys.every((key) => selectedKeys.has(key));

  function togglePageSelection() {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (allPageSelected) {
        selectablePageKeys.forEach((key) => next.delete(key));
      } else {
        selectablePageKeys.forEach((key) => next.add(key));
      }

      return next;
    });
  }

  async function saveResults(action) {
    if (action === "saveSelected" && selectedKeys.size === 0) return;

    if (action === "saveFiltered") {
      const confirmed = window.confirm(
        "Save all " +
          data.total +
          " filtered owners to Saved Prospects? This does not add them to the main CRM.",
      );

      if (!confirmed) return;
    }

    setSearchLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/property-prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          filters: appliedFilters,
          keys:
            action === "saveSelected"
              ? [...selectedKeys]
              : undefined,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        if (result.total && result.maxSaveFiltered) {
          throw new Error(
            result.error +
              " (" +
              result.total +
              " matches; maximum " +
              result.maxSaveFiltered +
              " per Add All action.)",
          );
        }

        throw new Error(
          result.details || result.error || "Could not save prospects.",
        );
      }

      setMessage(
        "Saved " +
          result.savedCount +
          " prospect" +
          (result.savedCount === 1 ? "" : "s") +
          ": " +
          result.newCount +
          " new, " +
          result.updatedCount +
          " refreshed.",
      );

      await runSearch(data.page, appliedFilters);
      onSaved?.();
    } catch (error) {
      setMessage(error.message || "Could not save prospects.");
    } finally {
      setSearchLoading(false);
    }
  }

  function resetFilters() {
    const reset = { ...DEFAULT_FILTERS };

    setFilters(reset);
    setAppliedFilters(reset);
    setSelectedKeys(new Set());
    setHasSearched(false);
    setMessage("");
    setData({
      prospects: [],
      total: 0,
      page: 1,
      totalPages: 1,
      sourcePropertyCount: 0,
      searchedCounties: [],
    });
  }

  return (
    <>
      <section className={styles.propertyFilterPanel}>
        <div className={styles.propertyFilterHeading}>
          <div>
            <p className={styles.eyebrow}>Owner finder</p>
            <h2>Find property owners worth researching</h2>
            <p>
              Search by geography, property size, and the number of matching
              properties an owner appears to hold.
            </p>
          </div>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={resetFilters}
            disabled={searchLoading}
          >
            Reset
          </button>
        </div>

        <div className={styles.propertyFilterGrid}>
          <label className={styles.propertyFilterField}>
            <span>Geography</span>
            <select
              value={filters.geography}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  geography: event.target.value,
                }))
              }
              disabled={searchLoading}
            >
              {GEOGRAPHY_OPTIONS.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.propertyFilterField}>
            <span>Property size</span>
            <select
              value={filters.propertySize}
              onChange={(event) =>
                handlePropertySizeChange(event.target.value)
              }
              disabled={searchLoading}
            >
              {SIZE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.propertyFilterField}>
            <span>Portfolio size</span>
            <div className={styles.propertyPortfolioRange}>
              <label>
                <small>Min</small>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Any"
                  value={filters.minPortfolioSize}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      minPortfolioSize: event.target.value,
                    }))
                  }
                  disabled={searchLoading}
                />
              </label>

              <label>
                <small>Max</small>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Any"
                  value={filters.maxPortfolioSize}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      maxPortfolioSize: event.target.value,
                    }))
                  }
                  disabled={searchLoading}
                />
              </label>
            </div>
          </div>
        </div>

        <p className={styles.propertyResultSummary}>
          “Portfolio” means qualifying properties found in this search. An All
          Metro search can group matching ownership across county lines.
        </p>

        <div className={styles.propertySearchActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => runSearch(1, filters)}
            disabled={searchLoading}
          >
            {searchLoading ? "Searching…" : "Search Property Owners"}
          </button>
        </div>
      </section>

      <section className={styles.propertyResultsPanel}>
        <div className={styles.propertyResultsHeading}>
          <div>
            <p className={styles.eyebrow}>Temporary results</p>
            <h2>
              {hasSearched
                ? data.total +
                  " owner" +
                  (data.total === 1 ? "" : "s") +
                  " matched"
                : "Search the metro owner data"}
            </h2>
            <p>
              {hasSearched
                ? "Owners with more matching properties are ranked first, followed by longer-held properties."
                : "Nothing enters Saved Prospects until you explicitly add it."}
            </p>
          </div>

          <div className={styles.propertyBulkActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => saveResults("saveSelected")}
              disabled={searchLoading || selectedKeys.size === 0}
            >
              Add Selected ({selectedKeys.size})
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => saveResults("saveFiltered")}
              disabled={
                searchLoading ||
                !hasSearched ||
                data.total === 0 ||
                data.total > 250
              }
              title={
                data.total > 250
                  ? "Refine to 250 or fewer owners before using Add All Filtered."
                  : ""
              }
            >
              Add All Filtered
            </button>
          </div>
        </div>

        {searchLoading && (
          <p className={styles.newsletterStatus}>
            Searching MetroGIS parcel records and grouping matching owners…
          </p>
        )}

        {!searchLoading && message && (
          <p className={styles.newsletterStatus}>{message}</p>
        )}

        {hasSearched && (
          <div className={styles.propertyResultSummary}>
            <span>{data.sourcePropertyCount} parcel records screened</span>
            {data.searchedCounties.length > 1 && (
              <span>{data.searchedCounties.length} counties searched</span>
            )}
            {data.total > 250 && (
              <span>
                Add All is limited to 250 owners. Use Portfolio Size or Add
                Selected to keep the prospect list focused.
              </span>
            )}
          </div>
        )}

        <div className={styles.propertyResultsTable}>
          <div className={styles.propertyResultsHeader}>
            <span>
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={togglePageSelection}
                disabled={!selectablePageKeys.length}
                aria-label="Select current page"
              />
            </span>
            <span>Owner</span>
            <span>Properties</span>
            <span>Total Units</span>
            <span>Locations</span>
            <span>Longest Held</span>
            <span>Est. Value</span>
            <span>State</span>
          </div>

          {!hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Ready to search.</strong>
              <span>
                Choose the owner profile you want to explore and run the
                search.
              </span>
            </div>
          ) : data.prospects.length ? (
            data.prospects.map((prospect) => {
              const unavailable = prospect.saved || prospect.inCrm;

              return (
                <div
                  className={styles.propertyResultRow}
                  key={prospect.propertyOutreachKey}
                >
                  <span>
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(
                        prospect.propertyOutreachKey,
                      )}
                      onChange={() =>
                        toggleResult(prospect.propertyOutreachKey)
                      }
                      disabled={unavailable}
                      aria-label={"Select " + prospect.ownerNameRaw}
                    />
                  </span>

                  <div>
                    <strong>{prospect.ownerNameRaw}</strong>
                    <span>{ownerTypeLabel(prospect.ownerType)}</span>
                  </div>

                  <span>{prospect.propertyCount}</span>
                  <span>{prospect.totalUnits || "—"}</span>

                  <div>
                    <strong>{formatLocations(prospect)}</strong>
                    <span>
                      {(prospect.counties || []).join(", ") || "Twin Cities"}
                    </span>
                  </div>

                  <span>
                    {prospect.longestHeldYears != null
                      ? prospect.longestHeldYears + " yrs"
                      : "—"}
                  </span>

                  <span>{formatMoney(prospect.totalAssessedValue)}</span>

                  <span>
                    <span
                      className={
                        styles.propertySourceBadge +
                        " " +
                        (prospect.inCrm
                          ? styles.propertyInCrmBadge
                          : prospect.saved
                            ? styles.propertySavedBadge
                            : styles.propertyNewBadge)
                      }
                    >
                      {prospect.inCrm
                        ? "IN CRM"
                        : prospect.saved
                          ? "SAVED"
                          : "NEW"}
                    </span>
                  </span>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <strong>No owners matched this profile.</strong>
              <span>
                Try a wider property-size range or a smaller portfolio
                threshold.
              </span>
            </div>
          )}
        </div>

        {hasSearched && data.totalPages > 1 && (
          <div className={styles.propertyPagination}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => runSearch(data.page - 1, appliedFilters)}
              disabled={searchLoading || data.page <= 1}
            >
              Previous
            </button>

            <span>
              Page {data.page} of {data.totalPages}
            </span>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => runSearch(data.page + 1, appliedFilters)}
              disabled={searchLoading || data.page >= data.totalPages}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}
