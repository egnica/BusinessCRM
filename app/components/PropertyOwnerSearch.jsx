"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";

const SIZE_OPTIONS = [
  { value: "2-4", label: "2–4 units", minUnits: "2", maxUnits: "4" },
  { value: "2-8", label: "2–8 units", minUnits: "2", maxUnits: "8" },
  { value: "2-20", label: "2–20 units", minUnits: "2", maxUnits: "20" },
];

const DEFAULT_FILTERS = {
  county: "Hennepin",
  city: "",
  propertySize: "2-4",
  minUnits: "2",
  maxUnits: "4",
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

function propertyAddress(property) {
  if (!property) return "No property address";

  return [
    property.street1,
    [property.city, property.state].filter(Boolean).join(", "),
    property.zip,
  ]
    .filter(Boolean)
    .join(" ");
}

function ownerTypeLabel(value) {
  if (value === "llc") return "LLC / Entity";
  if (value === "couple") return "Couple";
  return "Individual";
}

function preferredCity(county, cities) {
  const preferred =
    county === "Hennepin"
      ? ["Minneapolis"]
      : county === "Ramsey"
        ? ["Saint Paul", "St Paul", "St. Paul"]
        : [];

  return (
    preferred.map((name) => cities.find((city) => city === name)).find(Boolean) ||
    cities[0] ||
    ""
  );
}

function buildSearchParams(filters, page) {
  return new URLSearchParams({
    county: filters.county,
    city: filters.city,
    minUnits: filters.minUnits,
    maxUnits: filters.maxUnits,
    page: String(page),
    pageSize: "25",
  });
}

export default function PropertyOwnerSearch({ onSaved }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [counties, setCounties] = useState(["Hennepin"]);
  const [cities, setCities] = useState([]);
  const [cityLoading, setCityLoading] = useState(false);
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
  });

  const loadMetadata = useCallback(async (county) => {
    setCityLoading(true);

    try {
      const params = new URLSearchParams({ mode: "metadata", county });
      const res = await fetch(
        "/api/property-owners?" + params.toString(),
        { cache: "no-store" },
      );
      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          result.details || result.error || "Could not load cities.",
        );
      }

      const nextCities = result.cities || [];
      setCounties(result.counties || ["Hennepin"]);
      setCities(nextCities);

      const nextCity = preferredCity(county, nextCities);
      setFilters((current) => ({
        ...current,
        county,
        city: nextCity,
      }));
    } catch (error) {
      setMessage(error.message || "Could not load city options.");
    } finally {
      setCityLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (page, activeFilters) => {
    if (!activeFilters.city) {
      setMessage("Choose a city before searching.");
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
      });
      setMessage(error.message || "Property owner search failed.");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata(DEFAULT_FILTERS.county);
  }, [loadMetadata]);

  async function handleCountyChange(county) {
    setCities([]);
    setFilters((current) => ({
      ...current,
      county,
      city: "",
    }));
    setHasSearched(false);
    setMessage("");
    await loadMetadata(county);
  }

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
    });

    loadMetadata(DEFAULT_FILTERS.county);
  }

  return (
    <>
      <section className={styles.propertyFilterPanel}>
        <div className={styles.propertyFilterHeading}>
          <div>
            <p className={styles.eyebrow}>Search filters</p>
            <h2>Find property owners</h2>
            <p className={styles.propertyFilterDescription}>
              Start broad and reliable. Years owned and other property details
              are calculated after the parcel records come back.
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
            <span>County</span>
            <select
              value={filters.county}
              onChange={(event) =>
                handleCountyChange(event.target.value)
              }
              disabled={searchLoading}
            >
              {counties.map((county) => (
                <option value={county} key={county}>
                  {county}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.propertyFilterField}>
            <span>City / municipality</span>
            <select
              value={filters.city}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  city: event.target.value,
                }))
              }
              disabled={searchLoading || cityLoading}
            >
              {cityLoading && <option value="">Loading cities…</option>}
              {!cityLoading && !cities.length && (
                <option value="">No cities available</option>
              )}
              {!cityLoading &&
                cities.map((city) => (
                  <option value={city} key={city}>
                    {city}
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
        </div>

        <div className={styles.propertySearchActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => runSearch(1, filters)}
            disabled={searchLoading || cityLoading || !filters.city}
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
                : "Choose a city and search"}
            </h2>
            <p>
              {hasSearched
                ? "Longer-held properties are ranked toward the top. Nothing is saved until you choose it."
                : "Search results stay temporary until you add owners to Saved Prospects."}
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
            Searching MetroGIS parcel records…
          </p>
        )}

        {!searchLoading && message && (
          <p className={styles.newsletterStatus}>{message}</p>
        )}

        {hasSearched && (
          <div className={styles.propertyResultSummary}>
            <span>
              {data.sourcePropertyCount} parcel records screened
            </span>
            {data.total > 250 && (
              <span>
                Add All is limited to 250 owners. Use Add Selected for a
                focused prospect list.
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
            <span>Property</span>
            <span>Units</span>
            <span>Years Owned</span>
            <span>Portfolio</span>
            <span>Value</span>
            <span>State</span>
          </div>

          {!hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Ready to search.</strong>
              <span>
                Pick a county, city, and property size, then run the search.
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

                  <div>
                    <strong>
                      {propertyAddress(prospect.primaryProperty)}
                    </strong>
                    <span>
                      {prospect.primaryProperty?.yearBuilt
                        ? "Built " + prospect.primaryProperty.yearBuilt
                        : prospect.primaryProperty?.municipality ||
                          prospect.primaryProperty?.county}
                    </span>
                  </div>

                  <span>{prospect.primaryProperty?.numUnits || "—"}</span>
                  <span>
                    {prospect.primaryProperty?.ownershipYears ?? "—"}
                  </span>
                  <span>{prospect.propertyCount}</span>
                  <span>
                    {formatMoney(prospect.primaryProperty?.assessedValue)}
                  </span>
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
              <strong>No owners matched this search.</strong>
              <span>
                Try the next property-size range or another municipality.
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
