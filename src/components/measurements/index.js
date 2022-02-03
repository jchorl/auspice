import React, { useRef, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { isEqual, orderBy } from "lodash";
import { NODE_VISIBLE } from "../../util/globals";
import { getTipColorAttribute } from "../../util/colorHelpers";
import ErrorBoundary from "../../util/errorBoundry";
import Card from "../framework/card";
import Legend from "../tree/legend/legend";
import HoverPanel from "./hoverPanel";
import {
  createXScale,
  createYScale,
  groupMeasurements,
  clearMeasurementsSVG,
  drawMeasurementsSVG,
  drawMeansForColorBy,
  colorMeasurementsSVG,
  changeMeasurementsDisplay,
  getMeasurementDOMId,
  svgContainerDOMId,
  setHoverTransition,
  toggleDisplay
} from "./measurementsD3";

/**
 * A custom React Hook that returns a memoized value that will only change
 * if a deep comparison using lodash.isEqual determines the value is not
 * equivalent to the previous value.
 * @param {*} value
 * @returns {*}
 */
const useDeepCompareMemo = (value) => {
  const ref = useRef();
  if (!isEqual(value, ref.current)) {
    ref.current = value;
  }
  return ref.current;
};

/**
 * A custom React Redux Selector that reduces the tree redux state to an object
 * with the terminal strain names and their corresponding properties that
 * are relevant for the Measurement's panel. Uses the colorScale redux state to
 * find the current color attribute per strain.
 *
 * tree.visiblity and tree.nodeColors need to be an arrays that have the same
 * order as tree.nodes
 * @param {Object} state
 * @returns {Object<string,Object>}
 */
const treeStrainPropertySelector = (state) => {
  const { tree, controls } = state;
  const { colorScale } = controls;
  const intitialTreeStrainProperty = {
    treeStrainVisibility: {},
    treeStrainColors: {}
  };
  return tree.nodes.reduce((treeStrainProperty, node, index) => {
    const { treeStrainVisibility, treeStrainColors } = treeStrainProperty;
    // Only store properties of terminal strain nodes
    if (!node.hasChildren) {
      treeStrainVisibility[node.name] = tree.visibility[index];
      treeStrainColors[node.name] = {
        attribute: getTipColorAttribute(node, colorScale),
        color: tree.nodeColors[index]
      };
    }
    return treeStrainProperty;
  }, intitialTreeStrainProperty);
};

/**
 * Filters provided measurements to only measurements for strains that are
 * currently visible in the tree. Visibiity is indicated by the NODE_VISIBLE
 * value in the provided treeStrainVisibility object for strains.
 * @param {Array<Object>} measurements
 * @param {Object<string,number>} treeStrainVisibility
 * @returns {Array<Object>}
 */
const filterToTreeVisibileStrains = (measurements, treeStrainVisibility) => {
  // Check visibility against global NODE_VISIBLE
  const isVisible = (visibility) => visibility === NODE_VISIBLE;
  return measurements.filter((m) => isVisible(treeStrainVisibility[m.strain]));
};

const Measurements = ({height, width, showLegend}) => {
  // Use `lodash.isEqual` to deep compare object states to prevent unnecessary re-renderings of the component
  const { treeStrainVisibility, treeStrainColors } = useSelector((state) => treeStrainPropertySelector(state), isEqual);
  const groupBy = useSelector((state) => state.controls.measurementsGroupBy);
  const display = useSelector((state) => state.controls.measurementsDisplay);
  const showOverallMean = useSelector((state) => state.controls.measurementsShowOverallMean);
  const showThreshold = useSelector((state) => state.controls.measurementsShowThreshold);
  const collection = useSelector((state) => state.measurements.collectionToDisplay, isEqual);
  const { title, x_axis_label, threshold, fields, measurements } = collection;

  // Ref to access the D3 SVG
  const d3Ref = useRef(null);

  // State for storing data for the HoverPanel
  const [hoverData, setHoverData] = useState(null);

  // Filter and group measurements
  const filteredMeasurements = filterToTreeVisibileStrains(measurements, treeStrainVisibility);
  const groupedMeasurements = groupMeasurements(filteredMeasurements, groupBy);

  // Memoize D3 scale functions to allow deep comparison to work below for svgData
  const xScale = useMemo(() => createXScale(width, measurements), [width, measurements]);
  const yScale = useMemo(() => createYScale(measurements), [measurements]);
  // Memoize all data needed for basic SVG to avoid extra re-drawings
  const svgData = useDeepCompareMemo({ xScale, yScale, x_axis_label, threshold, groupedMeasurements});

  // Draw SVG from scratch
  useEffect(() => {
    clearMeasurementsSVG(d3Ref.current);
    drawMeasurementsSVG(d3Ref.current, svgData);
  }, [svgData]);

  // Color the SVG & redraw color-by means when SVG is re-drawn or when colors have changed
  useEffect(() => {
    colorMeasurementsSVG(d3Ref.current, treeStrainColors);
    drawMeansForColorBy(d3Ref.current, svgData, treeStrainColors);
  }, [svgData, treeStrainColors]);

  // Display raw/mean measurements when SVG is re-drawn, colors have changed, or display has changed
  useEffect(() => {
    changeMeasurementsDisplay(d3Ref.current, display);
  }, [svgData, treeStrainColors, display]);

  // Set up handle hover function and hover transitions
  useEffect(() => {
    // Creating function within useEffect so it doesn't get flagged as dependency
    const handleHoverMeasurement = (measurement) => {
      let newHoverData = null;
      if (measurement !== null) {
        // Filter out internal auspice fields (i.e. measurementsJitter and measurementsId)
        const displayFields = Object.keys(measurement).filter((field) => fields.has(field));
        // Order fields for display
        const fieldOrder = [...fields.keys()];
        const orderedFields = orderBy(displayFields, (field) => fieldOrder.indexOf(field));
        // Create a Map of measurement's data to save order of fields
        const measurementData = new Map();
        orderedFields.forEach((field) => {
          measurementData.set(fields.get(field).title, measurement[field]);
        });
        // HoverPanel expects an element id and the data for display
        newHoverData = {
          elementId: getMeasurementDOMId(measurement),
          containerId: svgContainerDOMId,
          data: measurementData
        };
      }
      setHoverData(newHoverData);
    };

    setHoverTransition(d3Ref.current, handleHoverMeasurement);
  }, [svgData, fields, groupBy]);

  useEffect(() => {
    toggleDisplay(d3Ref.current, "overallMean", showOverallMean);
  }, [svgData, showOverallMean]);

  useEffect(() => {
    toggleDisplay(d3Ref.current, "threshold", showThreshold);
  }, [svgData, showThreshold]);

  const getPanelTitle = () => {
    return `${title || "Measurements"} (grouped by ${fields.get(groupBy).title})`;
  };

  const getSVGContainerStyle = () => {
    return {
      overflowY: "auto",
      position: "relative",
      height: height,
      width: width
    };
  };

  return (
    <Card title={getPanelTitle()}>
      {showLegend &&
        <ErrorBoundary>
          <Legend right width={width}/>
        </ErrorBoundary>
      }
      <div id={svgContainerDOMId} style={getSVGContainerStyle()}>
        {hoverData &&
          <HoverPanel
            hoverData={hoverData}
          />
        }
        <svg
          id="d3MeasurementsSVG"
          width="100%"
          ref={d3Ref}
        />
      </div>
    </Card>
  );
};

export default Measurements;
