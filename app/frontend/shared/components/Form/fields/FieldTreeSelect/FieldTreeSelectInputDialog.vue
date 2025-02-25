<!-- Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/ -->

<script setup lang="ts">
import CommonInputSearch from '@shared/components/CommonInputSearch/CommonInputSearch.vue'
import CommonDialog from '@mobile/components/CommonDialog/CommonDialog.vue'
import CommonTicketStateIndicator from '@shared/components/CommonTicketStateIndicator/CommonTicketStateIndicator.vue'
import { closeDialog } from '@shared/composables/useDialog'
import { computed, nextTick, onMounted, ref, toRef, watch } from 'vue'
import { escapeRegExp } from 'lodash-es'
import { useTraverseOptions } from '@shared/composables/useTraverseOptions'
import { useLocaleStore } from '@shared/stores/locale'
import useSelectOptions from '../../composables/useSelectOptions'
import type { TreeSelectContext } from './types'
import { FlatSelectOption } from './types'
import type { SelectOption } from '../FieldSelect'
import useValue from '../../composables/useValue'

const props = defineProps<{
  context: TreeSelectContext
  name: string
  currentPath: FlatSelectOption[]
  flatOptions: FlatSelectOption[]
  sortedOptions: FlatSelectOption[]
}>()

const { isCurrentValue } = useValue(toRef(props, 'context'))

const emit = defineEmits<{
  (e: 'push', option: FlatSelectOption): void
  (e: 'pop'): void
}>()

const locale = useLocaleStore()

const currentParent = computed(
  () => props.currentPath[props.currentPath.length - 1] ?? null,
)

const filter = ref('')
const filterInput = ref<HTMLInputElement>()

const clearFilter = () => {
  filter.value = ''
}

const close = () => {
  closeDialog(props.name)
  clearFilter()
}

const pushToPath = (option: FlatSelectOption) => {
  emit('push', option)
}

const popFromPath = () => {
  emit('pop')
}

const contextReactive = toRef(props, 'context')

watch(() => contextReactive.value.noFiltering, clearFilter)

const focusFirstTarget = (targetElements?: HTMLElement[]) => {
  if (!targetElements || !targetElements.length) return

  targetElements[0].focus()
}

const {
  dialog,
  getSelectedOptionLabel,
  selectOption,
  getDialogFocusTargets,
  getSelectedOption,
} = useSelectOptions(toRef(props, 'flatOptions'), contextReactive)

const previousPageCallback = () => {
  popFromPath()
  clearFilter()
  nextTick(() => focusFirstTarget(getDialogFocusTargets(true)))
}

const nextPageCallback = (option?: SelectOption | FlatSelectOption) => {
  if (option && (option as FlatSelectOption).hasChildren) {
    pushToPath(option as FlatSelectOption)
    nextTick(() => focusFirstTarget(getDialogFocusTargets(true)))
  }
}

useTraverseOptions(() => dialog.value?.parentElement, {
  filterOption: (el) => el.tagName !== 'INPUT',
  direction: 'vertical',
  onArrowRight() {
    const focusedOption = document.activeElement as HTMLElement
    const { value } = focusedOption?.dataset || {}
    const option = value ? getSelectedOption(value) : undefined
    nextPageCallback(option)
    return false
  },
  onArrowLeft() {
    previousPageCallback()
    return false
  },
})

const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const filteredOptions = computed(() => {
  // In case we are not currently filtering for a parent, search across all options.
  let options = props.sortedOptions

  // Otherwise, search across options which are children of the current parent.
  if (currentParent.value)
    options = props.sortedOptions.filter((option) =>
      option.parents.includes(currentParent.value?.value),
    )

  // Trim and de-accent search keywords and compile them as a case-insensitive regex.
  //   Make sure to escape special regex characters!
  const filterRegex = new RegExp(
    escapeRegExp(deaccent(filter.value.trim())),
    'i',
  )

  // Search across options via their de-accented labels.
  return options.filter((option) =>
    filterRegex.test(deaccent(option.label || String(option.value))),
  )
})

const select = (option: FlatSelectOption) => {
  if (props.context.disabled) return
  selectOption(option)
  if (!props.context.multiple) close()
}

const currentOptions = computed(() => {
  // In case we are not currently filtering for a parent, return only top-level options.
  if (!currentParent.value)
    return props.sortedOptions.filter((option) => !option.parents?.length)

  // Otherwise, return all options which are children of the current parent.
  return props.sortedOptions.filter(
    (option) =>
      option.parents.length &&
      option.parents[option.parents.length - 1] === currentParent.value?.value,
  )
})

const goToPreviousPage = () => {
  previousPageCallback()
}

const goToNextPage = (option: FlatSelectOption) => {
  if (props.context.disabled) return
  nextPageCallback(option)
}

const selectAndClose = (option: FlatSelectOption) => {
  if (props.context.disabled) return
  select(option)
  // "Enter" always closes the dialog after selection: https://www.w3.org/WAI/ARIA/apg/patterns/menubar/
  close()
}

onMounted(() => {
  filterInput.value?.focus()
})

const getCurrentIndex = (option: FlatSelectOption) => {
  return props.flatOptions.findIndex((o) => o.value === option.value)
}
</script>

<template>
  <CommonDialog :name="name" :label="context.label" @close="close">
    <div class="w-full p-4">
      <CommonInputSearch
        v-if="!context.noFiltering"
        ref="filterInput"
        v-model="filter"
      />
    </div>
    <div
      v-if="currentPath.length"
      :class="{
        'px-6': !context.noFiltering,
      }"
      class="flex h-[58px] cursor-pointer items-center self-stretch py-5 px-4 text-base leading-[19px] text-white focus:bg-blue-highlight focus:outline-none"
      tabindex="0"
      role="button"
      :aria-label="$t('Back to previous page')"
      @click="goToPreviousPage()"
      @keypress.space.prevent="goToPreviousPage()"
    >
      <CommonIcon
        size="base"
        class="ltr:mr-3 rtl:ml-3"
        :name="`mobile-chevron-${
          locale.localeData?.dir === 'rtl' ? 'left' : 'right'
        }`"
      />
      <span class="grow font-semibold text-white/80">
        {{ currentParent.label || currentParent.value }}
      </span>
    </div>
    <!-- https://www.w3.org/WAI/ARIA/apg/patterns/listbox/ -->
    <div
      v-if="filter ? filteredOptions.length : currentOptions.length"
      ref="dialog"
      :class="{
        'border-t border-white/30': currentPath.length,
      }"
      :aria-label="$t('Select…')"
      class="flex grow flex-col items-start self-stretch overflow-y-auto"
      role="listbox"
      :aria-multiselectable="context.multiple"
    >
      <div
        v-for="(option, index) in filter ? filteredOptions : currentOptions"
        :id="`${name}-${option.value}`"
        :key="String(option.value)"
        :class="{
          'px-6': !context.noFiltering,
          'pointer-events-none': option.disabled,
        }"
        class="relative flex h-[58px] cursor-pointer items-center self-stretch py-5 px-4 text-base leading-[19px] text-white focus:bg-blue-highlight focus:outline-none"
        :tabindex="option.disabled ? '-1' : '0'"
        role="option"
        :aria-selected="
          option.disabled ? undefined : isCurrentValue(option.value)
        "
        :aria-setsize="flatOptions.length"
        :aria-posinset="getCurrentIndex(option) + 1"
        :data-value="option.value"
        :aria-haspopup="option.hasChildren && !filter ? 'menu' : 'false'"
        :aria-expanded="option.hasChildren && !filter ? 'false' : undefined"
        :aria-disabled="option.disabled ? 'true' : undefined"
        @click="select(option)"
        @keyup.enter.prevent="selectAndClose(option)"
        @keypress.space.prevent="select(option)"
      >
        <div
          v-if="index !== 0"
          :class="{
            'ltr:left-4 rtl:right-4':
              !context.multiple && !option.icon && !option.status,
            'ltr:left-[50px] rtl:right-[50px]':
              !context.multiple && option.icon && !option.status,
            'ltr:left-[58px] rtl:right-[58px]':
              !context.multiple && !option.icon && option.status,
            'ltr:left-[60px] rtl:right-[60px]':
              context.multiple && !option.icon && !option.status,
            'ltr:left-[88px] rtl:right-[88px]':
              context.multiple && option.icon && !option.status,
            'ltr:left-[94px] rtl:right-[94px]':
              context.multiple && !option.icon && option.status,
          }"
          class="absolute top-0 h-0 border-t border-white/10 ltr:right-4 rtl:left-4"
        />
        <CommonIcon
          v-if="context.multiple"
          :class="{
            '!text-white': isCurrentValue(option.value),
            'opacity-30': option.disabled,
          }"
          :name="
            isCurrentValue(option.value)
              ? 'mobile-check-box-yes'
              : 'mobile-check-box-no'
          "
          size="base"
          decorative
          class="text-white/50 ltr:mr-3 rtl:ml-3"
        />
        <CommonTicketStateIndicator
          v-if="option.status"
          :color-code="option.status"
          :label="option.label || String(option.value)"
          :class="{
            'opacity-30': option.disabled,
          }"
          class="ltr:mr-[11px] rtl:ml-[11px]"
        />
        <CommonIcon
          v-else-if="option.icon"
          :name="option.icon"
          :class="{
            '!text-white': isCurrentValue(option.value),
            'opacity-30': option.disabled,
          }"
          size="small"
          class="text-white/80 ltr:mr-[11px] rtl:ml-[11px]"
        />
        <span
          :class="{
            'font-semibold !text-white': isCurrentValue(option.value),
            'opacity-30': option.disabled,
          }"
          class="grow text-white/80"
        >
          {{ option.label || option.value }}
          <template v-if="filter">
            <span
              v-for="parentValue in (option as FlatSelectOption).parents"
              :key="String(parentValue)"
              class="text-gray"
            >
              —
              {{
                getSelectedOptionLabel(parentValue) ||
                i18n.t('%s (unknown)', parentValue.toString())
              }}
            </span>
          </template>
        </span>
        <CommonIcon
          v-if="!context.multiple && isCurrentValue(option.value)"
          :class="{
            'opacity-30': option.disabled,
            'ltr:mr-3 rtl:ml-3': option.hasChildren,
          }"
          size="tiny"
          decorative
          name="mobile-check"
        />
        <CommonIcon
          v-if="option.hasChildren && !filter"
          class="pointer-events-auto"
          size="base"
          :name="`mobile-chevron-${
            locale.localeData?.dir === 'rtl' ? 'left' : 'right'
          }`"
          role="link"
          :label="$t('Has submenu')"
          @click.stop="goToNextPage(option)"
        />
      </div>
    </div>
    <div
      v-if="filter && !filteredOptions.length"
      class="relative flex h-[58px] items-center justify-center self-stretch py-5 px-4 text-base leading-[19px] text-white/50"
      role="alert"
    >
      {{ $t('No results found') }}
    </div>
  </CommonDialog>
</template>
