import React from 'react';
import { connect } from "react-redux";
import { Helmet } from "react-helmet";
import { hasExtension, getExtension } from "../../util/extensions";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const Head = ({metadata, general}) => {
  let lang = general.language;

  i18n
  .use(initReactI18next)
  .init({
    resources: require("i18next-resource-store-loader!../../locales/index.js"),
    lng: lang,
    fallbackLng: "en",
    debug: process.env.NODE_ENV !== 'production' ? true : false,
    interpolation: {
      escapeValue: false
    },
    defaultNS: 'translation',
  });

  let pageTitle = "auspice";
  if (hasExtension("browserTitle")) {
    pageTitle = getExtension("browserTitle");
  }
  const displayedDataset = window.location.pathname
    .replace(/^\//g, '')
    .replace(/\/$/g, '')
    .replace(/\//g, ' / ')
    .replace(/:/g, ' : ');
  if (displayedDataset) {
    pageTitle = pageTitle + " / " + displayedDataset;
  }
  return (
    <Helmet>
      <title>
        {pageTitle}
      </title>
      {metadata && metadata.title ?
        <meta name="description" content={metadata.title} /> :
        null}
    </Helmet>
  );
};

/* we want this component to rerun each time the pathname changes, which we keep a copy
of in state. This allows us to detect changes such as redirects such as /flu/avian ->
/flu/avian/h5n1/ha. Similarly when the metadata changes. */
export default connect(
  (state) => ({
    pathname: state.general.pathname,
    metadata: state.metadata,
    general: state.general
  })
)(Head);
