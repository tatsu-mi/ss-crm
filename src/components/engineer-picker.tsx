"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Engineer, inactive } from "@/lib/model";

const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/g, "");
const LIMIT = 20;

export function EngineerPicker({
  engineers,
  selected,
  onChange,
  disabled = false,
}: {
  engineers: Engineer[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const term = normalize(query);
  const matches = term
    ? engineers.filter(
        (e) =>
          !inactive(e) &&
          !selected.includes(e.id) &&
          normalize(e.name).includes(term),
      )
    : [];
  const results = matches.slice(0, LIMIT);
  const expanded = open && !disabled && term.length > 0;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  useEffect(() => {
    if (expanded) activeOption.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, query, expanded]);
  function add(engineer: Engineer) {
    if (disabled || selected.includes(engineer.id)) return;
    onChange([...selected, engineer.id]);
    setQuery("");
    setActive(0);
    input.current?.focus();
  }
  return (
    <fieldset
      className="engineer-picker"
      disabled={disabled}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <legend>関連エンジニア</legend>
      {selected.length > 0 && (
        <ul
          className="engineer-picker-selected"
          aria-label="選択中の関連エンジニア"
        >
          {selected.map((engineerId) => {
            const engineer = engineers.find((e) => e.id === engineerId);
            const name = engineer?.name || "不明";
            return (
              <li key={engineerId}>
                <span>
                  {name}
                  {engineer && inactive(engineer) ? "（削除済み）" : ""}
                </span>
                <button
                  type="button"
                  aria-label={`${name}を解除`}
                  onClick={() => {
                    onChange(selected.filter((value) => value !== engineerId));
                    input.current?.focus();
                  }}
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="engineer-picker-search">
        <Search size={15} aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="関連エンジニアを検索"
          placeholder="名前で検索して追加"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-results` : undefined}
          aria-activedescendant={
            expanded && results.length
              ? `${id}-option-${activeIndex}`
              : undefined
          }
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                Math.max(
                  0,
                  Math.min(
                    results.length - 1,
                    index + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (expanded && results[activeIndex]) add(results[activeIndex]);
              else setOpen(true);
            } else if (event.key === "Escape" && expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
        {expanded && (
          <div className="engineer-picker-dropdown">
            <p role="status">
              {matches.length > LIMIT
                ? `${matches.length}件該当・先頭${LIMIT}件を表示。名前を追加して絞り込めます。`
                : matches.length
                  ? `${matches.length}件該当`
                  : "該当する未選択のエンジニアはいません。"}
            </p>
            <ul
              id={`${id}-results`}
              role="listbox"
              aria-label="関連エンジニアの検索結果"
              aria-multiselectable="true"
            >
              {results.map((engineer, index) => (
                <li key={engineer.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    tabIndex={-1}
                    ref={index === activeIndex ? activeOption : undefined}
                    id={`${id}-option-${index}`}
                    aria-selected={false}
                    className={index === activeIndex ? "active" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => add(engineer)}
                  >
                    {engineer.name}
                    <span aria-hidden="true">追加</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </fieldset>
  );
}
