/** Table styling (prototype "tbl tbl-cards"): a table on md+ screens, stacked rows on phones. */
export const TABLE = {
  wrap: 'relative overflow-x-auto rounded-xl border border-neutral-100 bg-white shadow-[0_1px_2px_rgba(20,26,34,0.04)]',
  table: 'w-full text-left text-sm max-md:block',
  thead: 'border-b border-neutral-100 bg-[#fbfcfa] max-md:hidden',
  th: 'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-ink-500',
  tbody: 'max-md:block',
  tr: 'border-t border-neutral-100 first:border-t-0 hover:bg-[#fbfcfa] max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-4 max-md:py-3.5',
  td: 'px-4 py-3.5 align-middle max-md:p-0',
  hideSm: 'max-md:hidden',
  fullSm: 'max-md:col-span-2',
}
