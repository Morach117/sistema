import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from 'use-debounce'
import axios from '@/lib/api'
import { readSession } from '@/auth/session'
import { toast } from 'sonner'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight, Loader2, RefreshCw, Upload } from 'lucide-react'

export default function Catalogo() {
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter] = useDebounce(globalFilter, 500)
  const savedContentScroll = useRef(null)
  const fileInputRef = useRef(null)
  const queryClient = useQueryClient()
  const isCatalogAdmin = readSession()?.user?.rol === 'admin'
  
  const [{ pageIndex, pageSize }, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const pagination = {
    pageIndex,
    pageSize,
  }

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['catalogo', pagination.pageIndex, pagination.pageSize, debouncedFilter],
    queryFn: async () => {
      const page = pagination.pageIndex + 1
      const res = await axios.get(`/api/catalogo/list?page=${page}&limit=${pagination.pageSize}&search=${debouncedFilter}`)
      return res.data
    },
    // React Query v5 retains the current tbody while the next result is fetched.
    placeholderData: keepPreviousData,
  })

  const importMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData()
      formData.append('archivo', file)
      return (await axios.post('/api/catalogo/importar', formData)).data
    },
    onSuccess: (response) => {
      setPagination((current) => ({ ...current, pageIndex: 0 }))
      queryClient.invalidateQueries({ queryKey: ['catalogo'] })
      const imported = response?.data?.imported || 0
      toast.success('Catálogo actualizado', { description: `${imported.toLocaleString('es-MX')} productos importados.` })
    },
    onError: (uploadError) => {
      toast.error('No se pudo importar el catálogo', {
        description: uploadError.response?.data?.error || uploadError.message
      })
    }
  })

  useEffect(() => {
    if (savedContentScroll.current === null) return
    const content = document.getElementById('main-content')
    if (content) content.scrollTop = savedContentScroll.current
    savedContentScroll.current = null
  }, [data])

  const preserveContentScroll = () => {
    savedContentScroll.current = document.getElementById('main-content')?.scrollTop ?? 0
  }

  const selectCatalogFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    importMutation.mutate(file)
  }

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
                  preserveContentScroll()
                  // Reset to page 0 on new search
                  setPagination(prev => ({ ...prev, pageIndex: 0 }))
                }}
                placeholder="Buscar por clave, código o descripción..."
                className="w-full pl-10 pr-4 py-3 border-2 border-input bg-background text-foreground placeholder:text-muted-foreground rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none shadow-inner transition-all font-bold"
              />
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isFetching && (
                <div role="status" aria-live="polite" className="flex items-center text-sm font-bold text-muted-foreground bg-secondary px-4 py-2 rounded-lg border border-border">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-500" />
                  Cargando datos...
                </div>
              )}
              {isCatalogAdmin && <>
                <input ref={fileInputRef} type="file" aria-label="Seleccionar reporte Excel SICAR" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" onChange={selectCatalogFile} />
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending} className="font-bold">
                  {importMutation.isPending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="mr-2 h-4 w-4" />}
                  {importMutation.isPending ? 'Importando…' : 'Importar Excel SICAR'}
                </Button>
              </>}
            </div>
          </div>

          {isError && (
            <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm font-bold text-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>No se pudo cargar el catálogo: {error.message}</span>
              <Button type="button" variant="outline" onClick={() => refetch()} className="w-fit border-destructive/40 bg-background">
                <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />Reintentar
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-border overflow-hidden bg-background shadow-inner">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary text-muted-foreground text-[10px] uppercase font-black tracking-widest backdrop-blur-md">
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
                <tbody aria-busy={isFetching} className={`divide-y divide-border transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
                  {table.getRowModel().rows?.length > 0 ? (
                    table.getRowModel().rows.map(row => (
                      <tr key={row.id} className="hover:bg-accent transition-colors text-foreground">
                        {row.getVisibleCells().map((cell) => (
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
                onClick={() => {
                  preserveContentScroll()
                  table.previousPage()
                }}
                disabled={!table.getCanPreviousPage()}
                className="bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 font-bold"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  preserveContentScroll()
                  table.nextPage()
                }}
                disabled={!table.getCanNextPage()}
                className="bg-background border-border text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 font-bold"
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
