import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Search,
  X,
} from "lucide-react";

type Option = {
  id: string;
  label: string;
  secondary?: string;
};

type MultiSelectProps = {
  label: string;
  placeholder: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
};

export default function MultiSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOptions = options.filter((option) =>
    value.includes(option.id)
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return options;

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        option.id.toLowerCase().includes(q) ||
        (option.secondary ?? "")
          .toLowerCase()
          .includes(q)
    );
  }, [options, query]);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: string) {
    onChange(value.filter((item) => item !== id));
  }

  return (
    <div className="wd-multi-select">
      <div className="wd-select-label">
        <span>{label}</span>

        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        )}
      </div>

      <button
        type="button"
        className={`wd-select-trigger ${
          open ? "open" : ""
        }`}
        onClick={() => setOpen(!open)}
      >
        <div className="wd-selected-items">
          {selectedOptions.length === 0 ? (
            <span className="wd-placeholder">
              {placeholder}
            </span>
          ) : (
            <>
              {selectedOptions.slice(0, 3).map((option) => (
                <span
                  className="wd-selected-chip"
                  key={option.id}
                >
                  {option.label}

                  <span
                    className="wd-chip-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(option.id);
                    }}
                  >
                    <X size={12} />
                  </span>
                </span>
              ))}

              {selectedOptions.length > 3 && (
                <span className="wd-more-chip">
                  +{selectedOptions.length - 3} more
                </span>
              )}
            </>
          )}
        </div>

        <ChevronDown
          size={17}
          className={`wd-chevron ${
            open ? "rotated" : ""
          }`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="wd-popover-backdrop"
            aria-label="Close selector"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          />

          <div className="wd-select-popover">
            <div className="wd-search">
              <Search size={16} />

              <input
                autoFocus
                value={query}
                placeholder={`Search ${label.toLowerCase()}...`}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                onClick={(event) =>
                  event.stopPropagation()
                }
              />

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="wd-results-header">
              <span>
                {filteredOptions.length} results
              </span>

              {value.length > 0 && (
                <span>{value.length} selected</span>
              )}
            </div>

            <div className="wd-results">
              {filteredOptions.length === 0 ? (
                <div className="wd-no-results">
                  <Search size={20} />
                  <strong>No results</strong>
                  <span>
                    Try another search.
                  </span>
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = value.includes(
                    option.id
                  );

                  return (
                    <button
                      type="button"
                      className={`wd-result ${
                        selected ? "selected" : ""
                      }`}
                      key={option.id}
                      onClick={() =>
                        toggle(option.id)
                      }
                    >
                      <div className="wd-result-text">
                        <strong>{option.label}</strong>

                        {option.secondary && (
                          <small>
                            {option.secondary}
                          </small>
                        )}
                      </div>

                      <span
                        className={`wd-check ${
                          selected ? "checked" : ""
                        }`}
                      >
                        {selected && (
                          <Check size={13} />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="wd-popover-footer">
              <span>
                {value.length === 0
                  ? "Nothing selected"
                  : `${value.length} selected`}
              </span>

              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                >
                  Clear selection
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}