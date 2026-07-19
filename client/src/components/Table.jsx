const hideBelowClasses = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell'
};

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right'
};

const densityClasses = {
  default: { head: 'px-5 py-3', cell: 'px-5 py-4' },
  compact: { head: 'px-4 py-2', cell: 'px-4 py-2' }
};

function columnClasses(column, base) {
  return [
    base,
    alignClasses[column.align] || alignClasses.left,
    column.nowrap ? 'whitespace-nowrap' : 'align-top',
    hideBelowClasses[column.hideBelow] || ''
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * `truncate` recorta con ellipsis, asi que el texto completo debe quedar
 * disponible en el title. Solo aplica a valores primitivos: un render
 * personalizado puede devolver JSX y ahi no hay texto que exponer.
 */
function cellTitle(column, row) {
  if (!column.truncate) return undefined;
  const value = row[column.key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined;
}

function CellContent({ column, row }) {
  const content = column.render ? column.render(row) : row[column.key];
  if (!column.truncate) return content;
  return (
    <div className="truncate" style={{ maxWidth: column.width || '18rem' }}>
      {content}
    </div>
  );
}

export function Table({
  columns,
  data,
  emptyText = 'Sin datos para mostrar',
  density = 'default'
}) {
  const spacing = densityClasses[density] || densityClasses.default;

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={columnClasses(
                  column,
                  `${spacing.head} font-semibold whitespace-nowrap`
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {data.length ? (
            data.map((row, index) => (
              <tr key={row.id || index} className="hover:bg-slate-50">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    title={cellTitle(column, row)}
                    style={column.width ? { width: column.width } : undefined}
                    className={columnClasses(column, `${spacing.cell} text-slate-700`)}
                  >
                    <CellContent column={column} row={row} />
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                className="px-5 py-8 text-center text-slate-500"
                colSpan={columns.length}
              >
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
