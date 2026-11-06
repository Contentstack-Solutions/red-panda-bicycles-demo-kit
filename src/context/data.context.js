"use client";

import React, { useContext, createContext } from 'react';

const DataContext = createContext({});
const PlpCommercePrefetchContext = createContext(null);

export function useDataContext() {
  return useContext(DataContext);
}

/** SSR-prefetched commerce category, products, and filters for the current PLP url. */
export function usePlpCommercePrefetch() {
  return useContext(PlpCommercePrefetchContext);
}

export default function DataContextProvider({ data, plpCommercePrefetch = null, children }) {
  return (
    <DataContext.Provider value={data}>
      <PlpCommercePrefetchContext.Provider value={plpCommercePrefetch}>
        {children}
      </PlpCommercePrefetchContext.Provider>
    </DataContext.Provider>
  );
}
