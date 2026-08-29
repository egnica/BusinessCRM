"use client";

import { useMemo, useState } from "react";
import styles from "../page.module.css";

const DEFAULT_FILTERS = {
  city: "Minneapolis",
  minProperties: "2",
  maxProperties: "8",
  maxResults: "100",
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

function buildSearchParams(filters, page) {
  return new URLSearchParams({
    city: filters.city.trim(),
    minProperties: filters.minProperties,
    maxProperties: filters.maxProperties,
    maxResults: filters.maxResults,
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
    matchedPropertyCount: 0,
  });

  function validateFilters(activeFilters) {
    const minProperties = Number(activeFilters.minProperties);
    const maxProperties = Number(activeFilters.maxProperties);
    const maxResults = Number(activeFilters.maxResults);

    if (!activeFilters.city.trim()) {
      return "Choose a city before searching.";
    }

    if (!Number.isFinite(minProperties) || minProperties < 2) {
      return "Property minimum must be at least 2.";
    }

    if (
      activeFilters.maxProperties !== "" &&
      (!Number.isFinite(maxProperties) || maxProperties < 2)
    ) {
      return "Property maximum must be at least 2 or left blank.";
    }

    if (
      activeFilters.maxProperties !== "" &&
      minProperties > maxProperties
    ) {
      return "Property minimum cannot be greater than the maximum.";
    }

    if (
      !Number.isFinite(maxResults) ||
      maxResults < 1 ||
      maxResults > 1000
    ) {
      return "Max Results must be between 1 and 1,000.";
    }

    return "";
  }

  async function runSearch(page, activeFilters) {
    const validationMessage = validateFilters(activeFilters);

    if (validationMessage) {
      setMessage(validationMessage);
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
        matchedPropertyCount:
          result.matchedPropertyCount || result.sourcePropertyCount || 0,
      });
      setAppliedFilters({
        ...activeFilters,
        city: result.filters?.city || activeFilters.city.trim(),
      });
      setHasSearched(true);
    } catch (error) {
      setHasSearched(true);
      setData({
        prospects: [],
        total: 0,
        page: 1,
        totalPages: 1,
        matchedPropertyCount: 0,
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
      matchedPropertyCount: 0,
    });
  }

  const cityLabel = appliedFilters.city || filters.city || "city";

  return (
    <>
      <section className={styles.propertyFilterPanel}>
        <div className={styles.propertyFilterHeading}>
          <div>
            <p className={styles.eyebrow}>Owner finder</p>
            <h2>Find owners by city</h2>
            <p>
              Count properties inside one city first. Metro-wide ownership is
              checked only after you save a specific prospect.
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

        <div className={styles.propertyFinderGrid}>
          <label className={styles.propertyFilterField}>
            <span>City</span>
            <input
              type="search"
              value={filters.city}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  city: event.target.value,
                }))
              }
              placeholder="Minneapolis"
              disabled={searchLoading}
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Properties in city min</span>
            <input
              type="number"
              min="2"
              step="1"
              value={filters.minProperties}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  minProperties: event.target.value,
                }))
              }
              disabled={searchLoading}
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Properties in city max</span>
            <input
              type="number"
              min="2"
              step="1"
              placeholder="Any"
              value={filters.maxProperties}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxProperties: event.target.value,
                }))
              }
              disabled={searchLoading}
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Max Results</span>
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={filters.maxResults}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  maxResults: event.target.value,
                }))
              }
              disabled={searchLoading}
            />
          </label>
        </div>

        <div className={styles.propertySearchActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => runSearch(1, filters)}
            disabled={searchLoading}
          >
            {searchLoading ? "Searching…" : "Search Owners"}
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
                  " returned"
                : "Search city property ownership"}
            </h2>
            <p>
              {hasSearched
                ? "These counts are only properties found inside " +
                  cityLabel +
                  "."
                : "Start with Minneapolis and a range such as 2–8 properties."}
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
            Grouping property ownership inside {filters.city || "the city"}…
          </p>
        )}

        {!searchLoading && message && (
          <p className={styles.newsletterStatus}>{message}</p>
        )}

        {hasSearched && (
          <div className={styles.propertyResultSummary}>
            <span>
              {data.matchedPropertyCount.toLocaleString("en-US")} properties
              represented in {cityLabel} · max {appliedFilters.maxResults} owners
            </span>
            {data.total > 250 && (
              <span>
                Add All is limited to 250 owners. Narrow the property range or
                use Add Selected.
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
            <span>Properties in {cityLabel}</span>
            <span>Longest Held</span>
            <span>Est. Value</span>
            <span>Mailing</span>
            <span>Status</span>
          </div>

          {!hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Ready to search.</strong>
              <span>
                Choose a city and a property-count range, then search.
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
                    {prospect.countsReconcile === false && (
                      <span>Property details need review</span>
                    )}
                  </div>

                  <strong>
                    {prospect.cityPropertyCount || prospect.propertyCount}
                  </strong>

                  <span>
                    {prospect.longestHeldYears != null
                      ? prospect.longestHeldYears + " yrs"
                      : "—"}
                  </span>

                  <span>{formatMoney(prospect.totalAssessedValue)}</span>
                  <span>{prospect.mailingLocation || "—"}</span>

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
              <span>Try a wider property range or another city.</span>
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
