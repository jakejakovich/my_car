
<template>
  <div class="app bg-dark text-light min-vh-100 p-4">
    <div class="container">
      <h1 class="text-center mb-4">Детали автомобиля</h1>

      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <b-button variant="primary" class="me-2" @click="openAddModal(null)">
            Добавить корневую деталь
          </b-button>
          <b-button variant="success" class="me-2" @click="exportToExcel">
            Экспорт в Excel
          </b-button>
          <b-button variant="danger" @click="exportToPDF">Экспорт в PDF</b-button>
        </div>
        <div class="text-end text-muted small">
          <div>Local: <span class="text-white">{{ localUrl }}</span></div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="table table-dark table-striped align-middle">
          <thead>
            <tr>
              <th style="width:5%">№</th>
              <th style="width:40%">Деталь</th>
              <th style="width:15%">Цена</th>
              <th style="width:10%">Кол-во</th>
              <th style="width:15%">Стоимость</th>
              <th style="width:15%">Действия</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in flattened" :key="row.id">
              <tr>
                <td>{{ row.num }}</td>
                <td>
                  <span :style="{ paddingLeft: (row.level - 1) * 18 + 'px' }">
                    <strong v-if="row.level === 1">{{ row.name }}</strong>
                    <span v-else>{{ row.name }}</span>
                  </span>
                </td>
                <td>{{ formatCurrency(row.price) }}</td>
                <td>
                  <div class="d-flex align-items-center">
                    <b-button size="sm" variant="secondary" @click="decreaseQuantity(row)">−</b-button>
                    <span class="mx-2">{{ row.quantity }}</span>
                    <b-button size="sm" variant="secondary" @click="increaseQuantity(row)">+</b-button>
                  </div>
                </td>
                <td>{{ formatCurrency(row.total) }}</td>
                <td>
                  <b-button size="sm" variant="outline-light" class="me-2" @click="openAddModal(row.id)">
                    Добавить
                  </b-button>
                  <b-button size="sm" variant="outline-warning" class="me-2" @click="openEditModal(row.refPart)">
                    Изменить
                  </b-button>
                  <b-button size="sm" variant="outline-danger" @click="confirmRemove(row.id)">
                    Удалить
                  </b-button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <b-modal
        :visible="showModal"
        @hide="resetModal"
        title="Добавить деталь"
        size="md"
        body-class="bg-dark text-light"
        header-class="bg-secondary text-white"
        footer-class="bg-dark text-light border-0"
        content-class="border border-secondary rounded shadow-lg">

        <form @submit.prevent="confirmAdd">
          <div class="mb-3">
            <label class="form-label">Название</label>
            <b-form-input v-model="modal.name" required />
          </div>

          <div class="mb-3">
            <label class="form-label">Цена (число)</label>
            <b-form-input type="number" min="0" v-model.number="modal.price" required />
            <div class="form-text">
              Если деталь имеет дочерние элементы, цена вычисляется автоматически.
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label">Количество</label>
            <b-form-input type="number" min="1" v-model.number="modal.quantity" required />
          </div>

          <div class="mb-3">
            <label class="form-label">Родитель</label>
            <b-form-select v-model="modal.parentId" :options="parentOptions" />
            <div class="form-text">Выберите родительскую деталь или оставьте "Корень".</div>
          </div>

          <div class="text-end">
            <b-button variant="secondary" @click="resetModal" class="me-2">Отмена</b-button>
            <b-button type="submit" variant="primary">Сохранить</b-button>
          </div>
        </form>
      </b-modal>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { ref, computed, nextTick } from 'vue'
import { BButton, BModal, BFormInput, BFormSelect } from 'bootstrap-vue-next'
import * as XLSX from 'xlsx'
import  jsPDF  from 'jspdf'
import autoTable from 'jspdf-autotable'
import 'jspdf-font'

interface Part {
  id: number
  name: string
  price: number
  quantity: number
  children?: Part[]
  parentId?: number | null
}

const parts = ref<Part[]>([
  {
    id: 1,
    name: 'Кузов',
    price: 0,
    quantity: 1,
    children: [
      {
        id: 11,
        name: 'Двери',
        price: 0,
        quantity: 3,
        children: [
          { id: 111, name: 'Замок', price: 5000, quantity: 4 },
          { id: 112, name: 'Ручки', price: 6000, quantity: 6 }
        ]
      }
    ]
  },
  {
    id: 2,
    name: 'Двигатель',
    price: 0,
    quantity: 1,
    children: [
      { id: 21, name: 'Поршни', price: 10000, quantity: 5 },
      { id: 22, name: 'Кольца', price: 2000, quantity: 3 }
    ]
  }
])

let nextId = 1000

function recalcPartPrice(p: Part): number {
  if ((p as any).basePrice === undefined) {
    (p as any).basePrice = p.price || 0
  }

  let total = (p as any).basePrice

  if (p.children?.length) {
    let childrenSum = 0
    for (const c of p.children) {
      const childTotal = recalcPartPrice(c)
      childrenSum += childTotal * (c.quantity || 1)
    }
    total += childrenSum
  }

  p.price = total
  return total
}


function recalcAll() {
  parts.value.forEach(p => recalcPartPrice(p))
}

const showModal = ref(false)
const modal = ref({ name: '', price: 0, quantity: 1, parentId: null as number | null })
const parentOptions = ref<{ text: string; value: number | null }[]>([])

function buildParentOptions() {
  const rows = flatten(parts.value)
  const opts: { text: string; value: number | null }[] = [
    { text: 'Корень (нет родителя)', value: null }
  ]
  rows.forEach(r => opts.push({ text: r.name, value: r.id }))
  parentOptions.value = opts
}

function openAddModal(parentId: number | null) {
  buildParentOptions()
  modal.value = { name: '', price: 0, quantity: 1, parentId }
  nextTick(() => (showModal.value = true))
}


const editMode = ref(false)
const editingPartId = ref<number | null>(null)

function openEditModal(part: Part) {
  buildParentOptions()
  modal.value = {
    name: part.name,
    price: part.price,
    quantity: part.quantity,
    parentId: findParentId(part.id)
  }
  editMode.value = true
  editingPartId.value = part.id
  showModal.value = true
}

function findParentId(childId: number): number | null {
  function search(list: Part[], parentId: number | null): number | null {
    for (const p of list) {
      if (p.id === childId) return parentId
      if (p.children) {
        const found = search(p.children, p.id)
        if (found !== null) return found
      }
    }
    return null
  }
  return search(parts.value, null)
}


function updatePart(id: number) {
  function traverse(list: Part[]) {
    for (const p of list) {
      if (p.id === id) {
        p.name = modal.value.name
        p.price = modal.value.price
        p.quantity = modal.value.quantity
        recalcPartPrice(p)
        return true
      }
      if (p.children && traverse(p.children)) {
        recalcPartPrice(p)
        return true
      }
    }
    return false
  }
  traverse(parts.value)
}


function resetModal() {
  showModal.value = false
  modal.value = { name: '', price: 0, quantity: 1, parentId: null }
}

function formatCurrency(v: number) {
  return v.toLocaleString('ru-RU', { style: 'currency', currency: 'KZT' })
}

type Row = { 
  id: number
  num: string
  name: string
  price: number
  quantity: number
  total: number
  level: number
  refPart: Part
}

function flatten(list: Part[], level = 1, prefix = ''): Row[] {
  return list.flatMap((p, index) => {
    recalcPartPrice(p)
    const currentNum = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
    const row: Row = {
      id: p.id,
      num: currentNum,
      name: p.name,
      price: p.price,
      quantity: p.quantity,
      total: p.price * p.quantity,
      level,
      refPart: p
    }
    const childrenRows = p.children ? flatten(p.children, level + 1, currentNum) : []
    return [row, ...childrenRows]
  })
}
const flattened = computed(() => flatten(parts.value))

function increaseQuantity(row: Row) {
  row.refPart.quantity++
  recalcAll()
}
function decreaseQuantity(row: Row) {
  if (row.refPart.quantity > 1) {
    row.refPart.quantity--
    recalcAll()
  }
}

function removeById(id: number) {
  function removeFromList(list?: Part[]): boolean {
    if (!list) return false
    for (let i = 0; i < list.length; i++) {
      const item = list[i]
      if (!item) continue

      if (item.id === id) {
        list.splice(i, 1)
        return true
      }

      if (Array.isArray(item.children) && removeFromList(item.children)) {
        recalcPartPrice(item)
        return true
      }
    }
    return false
  }

  if (removeFromList(parts.value)) {
    recalcAll()
  }
}

function confirmRemove(id: number) {
  if (confirm('Вы уверены, что хотите удалить эту деталь?')) {
    removeById(id)
  }
}

function confirmAdd() {
  if (editMode.value && editingPartId.value !== null) {
    updatePart(editingPartId.value)
  } 
  else {
    const newPart: Part = {
    id: ++nextId,
    name: modal.value.name || 'Новая деталь',
    price: modal.value.price || 0,
    quantity: modal.value.quantity || 1
    }
  const parentId = modal.value.parentId
  if (parentId == null) parts.value.push(newPart)
  else {
    const addTo = (list: Part[]): boolean => {
      for (const p of list) {
        if (p.id === parentId) {
          if (!p.children) p.children = []
          p.children.push(newPart)
          recalcPartPrice(p)
          return true
        }
        if (p.children && addTo(p.children)) {
          recalcPartPrice(p)
          return true
        }
      }
      return false
    }
    addTo(parts.value)
  }
  }
  recalcAll()
  resetModal()
}

function exportToExcel() {
  recalcAll()
  const data = flattened.value.map(r => ({
    НОМЕР: r.num,
    ДЕТАЛЬ: r.name,
    ЦЕНА: r.price,
    КОЛИЧЕСТВО: r.quantity,
    СТОИМОСТЬ: r.total
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Детали')
  XLSX.writeFile(wb, 'car_details.xlsx')
}


function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode.apply(null, Array.from(slice))
  }
  return btoa(binary)
}

async function exportToPDF() {
  try {
    recalcAll()

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })

    const fontNormalUrl = '/fonts/Roboto-Regular.ttf'
    const respNormal = await fetch(fontNormalUrl)
    if (!respNormal.ok) throw new Error('Не удалось загрузить Roboto-Regular.ttf')
    const base64Normal = arrayBufferToBase64(await respNormal.arrayBuffer())

    const fontBoldUrl = '/fonts/Roboto-Bold.ttf'
    const respBold = await fetch(fontBoldUrl)
    if (!respBold.ok) throw new Error('Не удалось загрузить Roboto-Bold.ttf')
    const base64Bold = arrayBufferToBase64(await respBold.arrayBuffer())

    doc.addFileToVFS('Roboto-Regular.ttf', base64Normal)
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
    doc.addFileToVFS('Roboto-Bold.ttf', base64Bold)
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
    doc.setFont('Roboto', 'normal')

    doc.setFontSize(16)
    doc.setFont('Roboto', 'bold')
    doc.text('Детали автомобиля', 40, 40)

    const body = flattened.value.map(r => [
      r.num,
      r.name,
      r.price.toLocaleString('ru-RU'),
      r.quantity.toString(),
      r.total.toLocaleString('ru-RU')
    ])

    autoTable(doc, {
      startY: 70,
      head: [['№','Деталь', 'Цена', 'Кол-во', 'Стоимость']],
      body,
      styles: {
        font: 'Roboto',
        fontStyle: 'normal',
        fontSize: 10,
        textColor: [0, 0, 0],
      },
      headStyles: {
        font: 'Roboto',
        fontStyle: 'bold',
        fillColor: [230, 230, 230],
        textColor: [0, 0, 0]
      },
      theme: 'grid',
      margin: { left: 40, right: 40 }
    })

    doc.save('car_details.pdf')
  } catch (err) {
    console.error('Ошибка при создании PDF:', err)
    alert('Ошибка при создании PDF — см. консоль.')
  }
}


const localUrl = computed(() => 'http://localhost:5173/')
</script>

<style scoped>
.app {
  background: #121212;
  color: #eaeaea;
}
.table th,
.table td {
  vertical-align: middle;
}
.table thead th {
  border-bottom: 1px solid #2b2b2b;
}
.form-text {
  color: #bdbdbd;
}

.b-form-input,
.form-control,
.b-form-select,
.form-select {
  background-color: #1e1e1e !important;
  color: #eaeaea !important;
  border: 1px solid #444 !important;
}

.b-form-input:focus,
.b-form-select:focus,
.form-select:focus {
  border-color: #888 !important;
  box-shadow: none !important;
  background-color: #222 !important;
}
</style>
