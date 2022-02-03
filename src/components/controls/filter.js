import React from "react";
import { connect } from "react-redux";
import "react-select/dist/react-select.css";
import "react-virtualized-select/styles.css";
import Select from "react-virtualized-select";
import { debounce } from 'lodash';
import { controlsWidth, isValueValid, strainSymbol, genotypeSymbol} from "../../util/globals";
import { collectGenotypeStates } from "../../util/treeMiscHelpers";
import { applyFilter } from "../../actions/tree";
import { removeAllFieldFilters, toggleAllFieldFilters, toggleSingleFilter } from "../../actions/measurements";
import { FilterBadge } from "../info/filterBadge";
import { SidebarSubtitle } from "./styles";

const DEBOUNCE_TIME = 200;

/**
 * <FilterData> is a (keyboard)-typing based search box intended to
 * allow users to filter samples. The filtering rules are not implemented
 * in this component, but are useful to spell out: we take the union of
 * entries within each category and then take the intersection of those unions.
 */
@connect((state) => {
  return {
    activeFilters: state.controls.filters,
    colorings: state.metadata.colorings,
    totalStateCounts: state.tree.totalStateCounts,
    nodes: state.tree.nodes,
    measurementsFieldsMap: state.measurements.collectionToDisplay.fields,
    measurementsFiltersMap: state.measurements.collectionToDisplay.filters,
    measurementsFilters: state.controls.measurementsFilters
  };
})
class FilterData extends React.Component {
  constructor(props) {
    super(props);
  }

  getStyles() {
    return {
      base: {
        width: controlsWidth,
        marginBottom: 0,
        fontSize: 14
      }
    };
  }
  getFilterTitle(filterName) {
    return this.props.colorings && this.props.colorings[filterName] && this.props.colorings[filterName].title || filterName;
  }
  makeOptions = () => {
    /**
     * The <Select> component needs an array of options to display (and search across). We compute this
     * by looping across each filter and calculating all valid options for each. This function runs
     * each time a filter is toggled on / off.
     */
    const options = [];
    Object.keys(this.props.activeFilters)
      .forEach((filterName) => {
        const filterTitle = this.getFilterTitle(filterName);
        const filterValuesCurrentlyActive = this.props.activeFilters[filterName].filter((x) => x.active).map((x) => x.value);
        Array.from(this.props.totalStateCounts[filterName].keys())
          .filter((itemName) => isValueValid(itemName)) // remove invalid values present across the tree
          .filter((itemName) => !filterValuesCurrentlyActive.includes(itemName)) // remove already enabled filters
          .sort() // filters are sorted alphabetically - probably not necessary for a select component
          .forEach((itemName) => {
            options.push({
              label: `${filterTitle} → ${itemName}`,
              value: [filterName, itemName]
            });
          });
      });
    if (genotypeSymbol in this.props.activeFilters) {
      Array.from(collectGenotypeStates(this.props.nodes))
        .sort()
        .forEach((o) => {
          options.push({
            label: `genotype ${o}`,
            value: [genotypeSymbol, o]
          });
        });
    }
    if (strainSymbol in this.props.activeFilters) {
      this.props.nodes
        .filter((n) => !n.hasChildren)
        .forEach((n) => {
          options.push({
            label: `sample → ${n.name}`,
            value: [strainSymbol, n.name]
          });
        });
    }
    if (this.props.measurementsOn && this.props.measurementsFiltersMap && this.props.measurementsFieldsMap) {
      this.props.measurementsFiltersMap.forEach(({values}, filterField) => {
        const { title } = this.props.measurementsFieldsMap.get(filterField);
        values.forEach((value) => {
          options.push({
            _type: "measurements", // custom field to differentiate measurements filters
            label: `${title} → ${value}`,
            value: [filterField, value]
          });
        });
      });
    }
    return options;
  }
  selectionMade = (sel) => {
    // Process measurment filters separately than tree filters
    if (sel._type === "measurements") {
      return this.props.dispatch(toggleSingleFilter(sel.value[0], sel.value[1], true));
    }
    return this.props.dispatch(applyFilter("add", sel.value[0], [sel.value[1]]));
  }
  summariseFilters = () => {
    const filterNames = Reflect.ownKeys(this.props.activeFilters)
      .filter((filterName) => this.props.activeFilters[filterName].length > 0);
    return filterNames.map((filterName) => {
      const n = this.props.activeFilters[filterName].filter((f) => f.active).length;
      return {
        filterName,
        displayName: filterBadgeDisplayName(n, this.getFilterTitle(filterName)),
        anyFiltersActive: () => this.props.activeFilters[filterName].filter((f) => f.active).length>0,
        remove: () => {this.props.dispatch(applyFilter("set", filterName, []));},
        activate: () => {this.props.dispatch(applyFilter("add", filterName, this.props.activeFilters[filterName].map((f) => f.value)));},
        inactivate: () => {this.props.dispatch(applyFilter("inactivate", filterName, this.props.activeFilters[filterName].map((f) => f.value)));}
      };
    });
  }
  summariseMeasurementsFilters = () => {
    return Object.entries(this.props.measurementsFilters).map(([field, valuesMap]) => {
      const activeFiltersCount = Array.from(valuesMap.values()).reduce((prevCount, currentValue) => {
        return currentValue.active ? prevCount + 1 : prevCount;
      }, 0);
      return {
        field,
        activeFiltersCount,
        badgeTitle: `${activeFiltersCount} x ${this.props.measurementsFieldsMap.get(field).title}`
      };
    });
  }
  render() {
    // options only need to be calculated a single time per render, and by adding a debounce
    // to `loadOptions` we don't slow things down by comparing queries to a large number of options
    const options = this.makeOptions();
    const loadOptions = debounce((input, callback) => callback(null, {options}), DEBOUNCE_TIME);
    const filterOption = (option, filter) => filter.toLowerCase().split(" ").every((word) => option.label.toLowerCase().includes(word));
    const styles = this.getStyles();
    const inUseFilters = this.summariseFilters();
    const measurementsFilters = this.summariseMeasurementsFilters();
    /* When filter categories were dynamically created (via metadata drag&drop) the `options` here updated but `<Async>`
    seemed to use a cached version of all values & wouldn't update. Changing the key forces a rerender, but it's not ideal */
    const divKey = String(Object.keys(this.props.activeFilters).length);
    return (
      <div style={styles.base} key={divKey}>
        <Select
          async
          name="filterQueryBox"
          placeholder="Type filter query here..."
          value={undefined}
          arrowRenderer={null}
          loadOptions={loadOptions}
          filterOption={filterOption}
          ignoreAccents={false}
          clearable={false}
          searchable
          multi={false}
          valueKey="label"
          onChange={this.selectionMade}
        />
        {inUseFilters.length ? (
          <>
            <SidebarSubtitle spaceAbove>
              {`Currently selected filter categories:`}
            </SidebarSubtitle>
            {inUseFilters.map((filter) => (
              <div style={{display: 'inline-block', margin: '2px'}} key={filter.displayName}>
                <FilterBadge
                  active={filter.anyFiltersActive()}
                  canMakeInactive
                  id={filter.displayName}
                  remove={filter.remove}
                  activate={filter.activate}
                  inactivate={filter.inactivate}
                  onHoverMessage={`Data is currently filtered by ${filter.displayName}`}
                >
                  {filter.displayName}
                </FilterBadge>
              </div>
            ))}
          </>
        ) : null}
        {measurementsFilters.length ? (
          <>
            <SidebarSubtitle spaceAbove>
              {"Currently selected measurements filters:"}
            </SidebarSubtitle>
            {measurementsFilters.map(({field, activeFiltersCount, badgeTitle}) => (
              <div style={{display: 'inline-block', margin: '2px'}} key={badgeTitle}>
                <FilterBadge
                  active={activeFiltersCount > 0}
                  canMakeInactive
                  id={badgeTitle}
                  remove={() => this.props.dispatch(removeAllFieldFilters(field))}
                  activate={() => this.props.dispatch(toggleAllFieldFilters(field, true))}
                  inactivate={() => this.props.dispatch(toggleAllFieldFilters(field, false))}
                  onHoverMessage={`Measurements are currently filtered by ${badgeTitle}`}
                >
                  {badgeTitle}
                </FilterBadge>
              </div>
            ))}
          </>
        ): null}
      </div>
    );
  }
}

export const FilterInfo = (
  <>
    {`Use this box to filter the displayed data based upon filtering criteria.
    For instance, start typing a country's name to filter the data accordingly.`}
    <br/>
    Data is filtered by forming a union of selected values within each category, and then
    taking the intersection between categories (if more than one category is selected).
    <br/>
    Scroll to the bottom of the main page (under the data visualisation)
    to see an expanded display of filters and available values.
  </>
);

export default FilterData;

function filterBadgeDisplayName(n, filterName) {
  if (filterName===strainSymbol) return `${n} x samples`;
  if (filterName===genotypeSymbol) return `${n} x genotypes`;
  return `${n} x  ${filterName}`;
}
