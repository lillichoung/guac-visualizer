import { Inter } from '@next/font/google'
import React, { useState } from "react";
import Graph from 'app/graph'
import { gql, useQuery, useLazyQuery } from '@apollo/client'
import styles from "../styles/Home.module.css";
import useSWR from 'swr'
import client from 'apollo/client'
import { Node, Edge, ParseNode } from 'app/ggraph'
import SBOMViewer from '@/app/sbom';
import { PackageQualifier, PackageVersion, GetPkgTypesDocument, GetPkgNamesDocument, GetPkgNamespacesDocument, GetPkgVersionsDocument,  GetPkgQuery, GetPkgQueryVariables, PkgSpec , GetPkgDocument, AllPkgTreeFragment, Package, PackageQualifier} from '../gql/__generated__/graphql';

const inter = Inter({ subsets: ['latin'] });

// TODO (mlieberman85): Some of the below still requires type definitions.

const processDataForCytoscape = (data) => {

  
  console.log("GQL DATA:", data);

  let nodes: Node[] = [];
  let edges: Edge[] = [];

  data.packages.forEach((p :Package, index) => {
    const sourceNodeId = `pkg-${index}`;
    const targetNodeId = `depPkg-${index}`;

    let gd = ParseNode(p);
    if (gd!= undefined) {
      nodes = [...nodes, ...gd.nodes];
      edges = [...edges, ...gd.edges];
    }
    // Create nodes for package and dependentPackage

  });


  return { nodes, edges };
};

function toVersionString (v :PackageVersion) {
  return v.version + JSON.stringify(v.qualifiers.map((l :PackageQualifier)=>l.key +"=" + l.value));

}

export default function Home() {
  // TODO (mlieberman85): Validate if SWR is better in this use case than alternatives like react query
  const [detailsText, setDetailsText] = useState("detailsText");
  const [buttonHit, setButtonHit] = useState(false);
  const [requested, setRequested] = useState("{}");
  const [data, setData] = useState<GetPkgQuery>({ packages: []});
  const [graphData, setGraphData] = useState([]);


  // Package Selectors
  const defaultNull = "<NULL>";

  const [selectPackageType, setSelectPackageType] = useState(defaultNull);
  const [selectPackageNamespace, setSelectPackageNamespace] = useState(defaultNull);
  const [selectPackageName, setSelectPackageName] = useState(defaultNull);
  const [selectPackageVersion, setSelectPackageVersion] = useState(defaultNull);

  let query = GetPkgTypesDocument;
  let queryVariables = {};
  if (selectPackageType != defaultNull) {
    query = GetPkgNamespacesDocument;
    queryVariables.type = selectPackageType;
  }
  if (selectPackageNamespace != defaultNull) {
    query = GetPkgNamesDocument;
    queryVariables.namespace = selectPackageNamespace;
  }
  if (selectPackageName != defaultNull) {
    query = GetPkgVersionsDocument;
    queryVariables.name = selectPackageName;
  }
  
  const queryReturn = useQuery(GetPkgVersionsDocument, { variables: queryVariables});
  const pkgLoading = queryReturn.loading;
  const pkgError  = queryReturn.error;
  const pkgData = queryReturn.data;
  //console.log("ALL PACKAGES", allPackages);
  
  //console.log("ALL data", allPackages.data.packages);
  let packageTrie = new Map();

  if (!pkgError && !pkgLoading) {
  
    pkgData.packages.forEach((t)=> {
      const tMap = new Map();
      t.namespaces.forEach((ns) => {
        const nsMap = new Map();
        ns.names.forEach((n) => {
          const nMap = new Map();
          n.versions.forEach((version)=> {
            nMap.set(toVersionString(version), version)
          });
          nsMap.set(n.name, nMap);
        })
        tMap.set(ns.namespace, nsMap);
      });
      packageTrie.set(t.type, tMap);
    })

    console.log("PKGTRIE:", packageTrie);
  }


  const other = `{
    "type":"deb",
    "namespace":"ubuntu",
    "name": "dpkg",
    "qualifiers": [{"key":"arch", "value":"amd64"}]
  }`;


  function initGraph () {
    setData({packages: []});
    let spec = {};
    if (selectPackageType != defaultNull){
      spec.type = selectPackageType;

      if (selectPackageNamespace != defaultNull) {
        spec.namespace = selectPackageNamespace;
        if (selectPackageName != defaultNull) {
          spec.name = selectPackageName;
        }
      }
    }
      
    client.query({
      query: GetPkgDocument,
      variables: {
        spec: spec,

        // spec: JSON.parse(s),
      }
    }).then( res => {
      console.log("res data", res.data);
      setData(res.data);
      
      setGraphData([{key: crypto.randomUUID(), data: res.data}]);
    });
  }

  function writeDetailsHandler (x : any) {
    setDetailsText(JSON.stringify(x,null,2));

  }

    
  

  //const { data, error } = useSWR(TEST_QUERY, fetcher)
  //if (error) return <div>failed to load</div>
  if (!data) return <div>loading...</div>
  return (
    <>
      <div>
        <h1>GUAC Visualizer</h1>
        <select value={selectPackageType} onChange={(e)=> {setSelectPackageType(e.target.value); setSelectPackageNamespace(defaultNull); setSelectPackageName(defaultNull); setSelectPackageVersion(defaultNull);}}>
          <option key={defaultNull} value={defaultNull}></option>
          {([...packageTrie]).map(([k,v]) => <option key={k}>{k}</option>)}
        </select>
        
        
        {selectPackageType!=defaultNull && 
          <select value={selectPackageNamespace} onChange={(e)=> {setSelectPackageNamespace(e.target.value); setSelectPackageName(defaultNull); setSelectPackageVersion(defaultNull);}}>
            <option key={defaultNull} value={defaultNull}></option>
            {([...packageTrie.get(selectPackageType)]).map(([k,v]) => <option key={k}>{k}</option>)}
          </select>
        }
        {selectPackageNamespace!=defaultNull && 
          <select value={selectPackageName} onChange={(e)=> {setSelectPackageName(e.target.value); setSelectPackageVersion(defaultNull);}}>
            <option key={defaultNull} value={defaultNull}></option>
            {([...packageTrie.get(selectPackageType).get(selectPackageNamespace)]).map(([k,v]) => <option key={k}>{k}</option>)}
          </select>
        }
        {selectPackageName!=defaultNull && 
          <select value={selectPackageVersion} onChange={(e)=> setSelectPackageVersion(e.target.value)}>
            <option key={defaultNull} value={defaultNull}></option>
            {([...packageTrie.get(selectPackageType).get(selectPackageNamespace).get(selectPackageName)]).map(([k,v]) => <option key={k}>{toVersionString(v)}</option>)}
          </select>
        }
        {selectPackageVersion != defaultNull && <button onClick={e => initGraph()}>submit</button>}
        <br />
        
        <textarea name="details-text" rows={10} cols={50} value={JSON.stringify(data)} onChange={() => {}} />

        <textarea name="details-text" rows={10} cols={50} value={detailsText} onChange={e => setDetailsText(e.target.value)}/>
        <div
          style={{
//            border: "1px solid",
            backgroundColor: "#F0F0F0",
            
          }}
        >
          {/* skip sending in data which will be delegated to the graph object by passing in a way to retrieve the data instead */}
          {
            graphData.map((d)=>
            <Graph key={d.key} layout="dagre" writeDetails={writeDetailsHandler} graphData={processDataForCytoscape(d.data)} />
            //<Graph layout="dagre" writeDetails={writeDetailsHandler} graphData={processDataForCytoscape(d)} />
            )
          } 
        </div>
      </div>
      
    </>
  )
}