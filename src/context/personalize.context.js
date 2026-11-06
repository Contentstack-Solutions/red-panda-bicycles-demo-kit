"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import Personalize from '@contentstack/personalize-edge-sdk';
import { personalizeProjectUid } from '@/lib/personalizeProject';

const PersonalizeContext = createContext(null);

export let sdkInstance = null;

export function PersonalizeProvider({ children }) {
 const [sdk, setSdk] = useState(null);
 const [initialized, setInitialized] = useState(false);
 
 useEffect(() => {
   getPersonalizeInstance().then((instance) => {
     setSdk(instance);
     setInitialized(true);
   });
 }, []);
 
 return (
   <PersonalizeContext.Provider value={sdk}>
     {initialized && children}
   </PersonalizeContext.Provider>
 );
}

export function usePersonalize() {
 return useContext(PersonalizeContext);
}

async function getPersonalizeInstance() {
 if (!Personalize.getInitializationStatus()) {
  // Check if personalization is properly configured
  // R37: CONTENTSTACK_PERSONALIZATION is the project UID; unset or "true" falls back to CONTENTSTACK_PERSONALIZE_PROJECT_UID.
  const projectUid = personalizeProjectUid({
    CONTENTSTACK_PERSONALIZATION: process.env.CONTENTSTACK_PERSONALIZATION,
    CONTENTSTACK_PERSONALIZE_PROJECT_UID: process.env.CONTENTSTACK_PERSONALIZE_PROJECT_UID,
  });
  if (!projectUid) {
    console.warn('CONTENTSTACK_PERSONALIZATION is not properly configured. Personalization features will be disabled.');
    return null;
  }
  
  if(process.env.CONTENTSTACK_PERSONALIZE_EDGE_API_URL) {
    Personalize.setEdgeApiUrl(process.env.CONTENTSTACK_PERSONALIZE_EDGE_API_URL);
  }
  
  try {
    sdkInstance = await Personalize.init(projectUid);
  } catch (error) {
    console.error('Failed to initialize Personalize SDK:', error);
    return null;
  }
 }
 return sdkInstance;
}