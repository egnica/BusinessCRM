"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";

const DEFAULT_FILTERS = {
  county: "Hennepin",
  cities: [],
  minUnits: "2",
  maxUnits: "4",
  minOwnershipYears: "20",
  ownerTypes: ["individual", "couple", "llc"],
  homestead: "any",
  minAssessedValue: "",
  maxAssessedValue: "",
  builtBefore: "",
  minPortfolioSize: "1",
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

function buildSearchParams(filters, page) {
  const params = new URLSearchParams({
    county: filters.county,
    minUnits: filters.minUnits || "2",
    maxUnits: filters.maxUnits || "20",
    minOwnershipYears: filters.minOwnershipYears || "0",
    ownerTypes: filters.ownerTypes.join(","),
    homestead: filters.homestead,
    minAssessedValue: filters.minAssessedValue || "0",
    maxAssessedValue: filters.maxAssessedValue || "0",
    builtBefore: filters.builtBefore || "0",
    minPortfolioSize: filters.minPortfolioSize || "1",
    page: String(page),
    pageSize: "25",
  });

  if (filters.cities.length) {
    params.set("cities", filters.cities.join(","));
  }

  return params;
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
      if (!res.ok) throw new Error(result.error || "Could not load cities.");
      setCounties(result.counties || ["Hennepin"]);
      setCities(result.cities || []);
    } catch (error) {
      setMessage(error.message || "Could not load city options.");
    } finally {
      setCityLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (page, activeFilters) => {
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
      setAppliedFilters({
        ...activeFilters,
        cities: [...activeFilters.cities],
        ownerTypes: [...activeFilters.ownerTypes],
      });
      setHasSearched(true);
    } catch (error) {
      setHasSearched(true);
      setMessage(error.message || "Property owner search failed.");
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata(DEFAULT_FILTERS.county);
  }, [loadMetadata]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleCountyChange(value) {
    setFilters((current) => ({
      ...current,
      county: value,
      cities: [],
    }));
    setCities([]);
    await loadMetadata(value);
  }

  function toggleCity(city) {
    setFilters((current) => ({
      ...current,
      cities: current.cities.includes(city)
        ? current.cities.filter((item) => item !== city)
        : [...current.cities, city],
    }));
  }

  function toggleOwnerType(ownerType) {
    setFilters((current) => {
      const exists = current.ownerTypes.includes(ownerType);
      const next = exists
        ? current.ownerTypes.filter((item) => item !== ownerType)
        : [...current.ownerTypes, ownerType];

      return {
        ...current,
        ownerTypes: next.length ? next : current.ownerTypes,
      };
    });
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
        throw new Error(result.error || "Could not save prospects.");
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
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
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
            <h2>Find owners worth reviewing</h2>
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
            <span>Minimum years owned</span>
            <select
              value={filters.minOwnershipYears}
              onChange={(event) =>
                updateFilter("minOwnershipYears", event.target.value)
              }
            >
              <option value="0">Any recorded sale date</option>
              <option value="10">10+ years</option>
              <option value="15">15+ years</option>
              <option value="20">20+ years</option>
              <option value="25">25+ years</option>
              <option value="30">30+ years</option>
            </select>
          </label>

          <label className={styles.propertyFilterField}>
            <span>Minimum units</span>
            <input
              type="number"
              min="1"
              value={filters.minUnits}
              onChange={(event) =>
                updateFilter("minUnits", event.target.value)
              }
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Maximum units</span>
            <input
              type="number"
              min="1"
              value={filters.maxUnits}
              onChange={(event) =>
                updateFilter("maxUnits", event.target.value)
              }
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Homestead</span>
            <select
              value={filters.homestead}
              onChange={(event) =>
                updateFilter("homestead", event.target.value)
              }
            >
              <option value="any">Any</option>
              <option value="non-homestead">Non-homestead only</option>
              <option value="homestead">Homestead only</option>
            </select>
          </label>

          <label className={styles.propertyFilterField}>
            <span>Minimum portfolio size</span>
            <select
              value={filters.minPortfolioSize}
              onChange={(event) =>
                updateFilter("minPortfolioSize", event.target.value)
              }
            >
              <option value="1">Any</option>
              <option value="2">2+ matching properties</option>
              <option value="3">3+ matching properties</option>
              <option value="5">5+ matching properties</option>
            </select>
          </label>

          <label className={styles.propertyFilterField}>
            <span>Minimum assessed value</span>
            <input
              type="number"
              min="0"
              step="50000"
              placeholder="No minimum"
              value={filters.minAssessedValue}
              onChange={(event) =>
                updateFilter("minAssessedValue", event.target.value)
              }
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Maximum assessed value</span>
            <input
              type="number"
              min="0"
              step="50000"
              placeholder="No maximum"
              value={filters.maxAssessedValue}
              onChange={(event) =>
                updateFilter("maxAssessedValue", event.target.value)
              }
            />
          </label>

          <label className={styles.propertyFilterField}>
            <span>Built before</span>
            <input
              type="number"
              min="1800"
              max="2100"
              placeholder="Any year"
              value={filters.builtBefore}
              onChange={(event) =>
                updateFilter("builtBefore", event.target.value)
              }
            />
          </label>
        </div>

        <div className={styles.propertyOwnerTypeFilter}>
          <span>Owner type</span>
          <div>
            {[
              ["individual", "Individual"],
              ["couple", "Couple"],
              ["llc", "LLC / Entity"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={filters.ownerTypes.includes(value)}
                  onChange={() => toggleOwnerType(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.propertyCityFilter}>
          <div className={styles.propertyCityHeader}>
            <div>
              <strong>Cities / municipalities</strong>
              <span>
                {filters.cities.length
                  ? filters.cities.length + " selected"
                  : "None selected = entire county"}
              </span>
            </div>
            <div>
              <button
                type="button"
                onClick={() => updateFilter("cities", [...cities])}
                disabled={cityLoading}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => updateFilter("cities", [])}
              >
                Clear
              </button>
            </div>
          </div>

          <div className={styles.propertyCityList}>
            {cityLoading ? (
              <span>Loading cities…</span>
            ) : (
              cities.map((city) => (
                <label key={city}>
                  <input
                    type="checkbox"
                    checked={filters.cities.includes(city)}
                    onChange={() => toggleCity(city)}
                  />
                  {city}
                </label>
              ))
            )}
          </div>
        </div>

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
                : "Choose filters and run a search"}
            </h2>
            <p>
              {hasSearched
                ? "Showing 25 at a time. Nothing is saved until you choose it."
                : "The tool will not query MetroGIS until you click Search Property Owners."}
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

        {message && (
          <p className={styles.newsletterStatus}>{message}</p>
        )}

        {hasSearched && (
          <div className={styles.propertyResultSummary}>
            <span>
              {data.sourcePropertyCount} qualifying parcel records screened
            </span>
            {data.total > 250 && (
            <span>
              Add All is limited to 250 owners. Refine the filters for a
              more intentional saved list.
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
            <span>Primary Property</span>
            <span>Units</span>
            <span>Years</span>
            <span>Portfolio</span>
            <span>Value</span>
            <span>State</span>
          </div>

          {!hasSearched ? (
            <div className={styles.emptyState}>
              <strong>Ready when you are.</strong>
              <span>
                Select a county and any filters you want, then run the search.
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
                      {prospect.primaryProperty?.municipality ||
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
              <strong>No owners match these filters.</strong>
              <span>Try widening the geography or ownership criteria.</span>
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
