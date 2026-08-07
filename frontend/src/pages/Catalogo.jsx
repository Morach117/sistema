import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import axios from 'axios'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export default function Catalogo() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter] = useDebounce(globalFilter, 500)
  
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const pagination = {
    pageIndex,
    pageSize,
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['catalogo', pagination.pageIndex, pagination.pageSize, debouncedFilter],
    queryFn: async () => {
      const page = pagination.pageIndex + 1
      const res = await axios.get(`/api/catalogo/list?page=${page}&limit=${pagination.pageSize}&search=${debouncedFilter}`)
      return res.data
    },
    keepPreviousData: true,
  })

  const columns = [
    {
      accessorKey: 'codigo_barras',
      header: 'Código Barras',
      cell: info => <span className="font-bold text-indigo-400">{info.getValue()}</span>
    },
    {
      accessorKey: 'descripcion',
      header: 'Descripción',
    },
    {
      accessorKey: 'fecha_actualizacion',
      header: 'Última Actualización',
      cell: info => new Date(info.getValue()).toLocaleString()
    },
  ]

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    pageCount: data?.meta?.totalPages ?? -1,
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">Catálogo Maestro</h1>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5 ml-1">Base de datos central de productos</p>
      </div>

      <Card className="glass-panel border-slate-800/60 bg-slate-900/40 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
            <div className="relative w-full max-w-md group">
              <input
                type="text"
                value={globalFilter}
                onChange={e => {
                  setGlobalFilter(e.target.value)
                  // Reset to page 0 on new search
                  setPagination(prev => ({ ...prev, pageIndex: 0 }))
                }}
                placeholder="Buscar por clave, código o descripción..."
                className="w-full pl-10 pr-4 py-3 border-2 border-slate-700 bg-slate-950/50 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-200 placeholder:text-slate-600 outline-none shadow-inner transition-all font-bold"
              />
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            {isLoading && (
              <div className="flex items-center text-sm font-bold text-slate-500 bg-slate-950/30 px-4 py-2 rounded-lg border border-slate-800/60">
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-500" />
                Cargando datos...
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800/60 overflow-hidden bg-slate-950/20 shadow-inner">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 text-slate-500 text-[10px] uppercase font-black tracking-widest backdrop-blur-md">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} className="border-b border-slate-800/60">
                      {headerGroup.headers.map(header => (
                        <th key={header.id} className="px-6 py-4">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {table.getRowModel().rows?.length > 0 ? (
                    table.getRowModel().rows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-800/30 transition-colors text-slate-300">
                        {row.getVisibleCells().map((cell, i) => (
                          <td key={cell.id} className="px-6 py-4 font-bold">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500 font-bold">
                        {isError ? `Error: ${error.message}` : isLoading ? 'Cargando...' : 'No se encontraron resultados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between mt-6">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Página <span className="text-slate-200">{table.getState().pagination.pageIndex + 1}</span> de{' '}
              <span className="text-slate-200">{table.getPageCount()}</span>
              {data?.meta?.total && ` (${data.meta.total} totales)`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50 font-bold"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-50 font-bold"
              >
                Siguiente
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
