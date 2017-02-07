import * as _ from 'lodash';
import client from "../../api/cbioportalClientInstance";
import {toJS, observable, reaction, action, computed, whyRun, expr} from "../../../../node_modules/mobx/lib/mobx";
import {TypeOfCancer as CancerType, GeneticProfile, CancerStudy, SampleList} from "../../api/CBioPortalAPI";
import CancerStudyTreeData from "./CancerStudyTreeData";
import StudyListLogic from "../StudyList/StudyListLogic";
import {remoteData} from "../../api/remoteData";
import {labelMobxPromises} from "../../api/MobxPromise";

export type PriorityStudies = {
	[category:string]: string[]
};
export const defaultSelectedAlterationTypes:GeneticProfile['geneticAlterationType'][] = [
	'MUTATION_EXTENDED',
	'COPY_NUMBER_ALTERATION'
];

// mobx observable
export class QueryStore
{
	constructor()
	{
 		labelMobxPromises(this);
		reaction(
			() => this.geneticProfiles.result,
			profiles => {
				let selectedProfileIds = [];
				for (let profile of profiles)
					if (_.includes(defaultSelectedAlterationTypes, profile.geneticAlterationType))
						selectedProfileIds.push(profile.geneticProfileId);
				this.selectedProfileIds = selectedProfileIds;
			},
			{
				name: "Select default Genetic Profile IDs"
			}
		);
	}

	@computed get stateToSerialize()
	{
		let keys:Array<keyof this> = [
			'searchText',
			'selectedStudyIds',
			'dataTypePriority',
			'selectedProfileIds',
			'zScoreThreshold',
			'selectedSampleListId',
			'caseIds',
			'caseIdsMode',
			'geneSet',
		];
		return _.pick(this, keys);
	}

	// query parameters
	@observable searchText:string = '';
	@observable.ref selectedStudyIds:ReadonlyArray<string> = [];
	@observable dataTypePriority = {mutation: true, cna: true};
	@observable.ref selectedProfileIds:ReadonlyArray<string> = [];
	@observable zScoreThreshold:string = '2.0';
	@observable selectedSampleListId = '';
	@observable caseIds = '';
	@observable caseIdsMode:'sample'|'patient' = 'sample';
	@observable geneSet = '';

	// visual options
	@observable.ref searchTextPresets:ReadonlyArray<string> = [
		'tcga',
		'tcga -provisional',
		'tcga -moratorium',
		'tcga OR icgc',
		'-"cell line"',
		'prostate mskcc',
		'esophageal OR stomach',
		'serous',
		'breast',
	];
	@observable priorityStudies:PriorityStudies = {
		'Shared institutional Data Sets': ['mskimpact', 'cellline_mskcc'],
		'Priority Studies': ['blca_tcga_pub', 'coadread_tcga_pub', 'brca_tcga_pub2015'], // for demo
	};
	@observable showSelectedStudiesOnly:boolean = false;
	@observable.shallow selectedCancerTypeIds:string[] = [];
	@observable maxTreeDepth:number = 9;
	@observable clickAgainToDeselectSingle:boolean = true;

	// remote data
	readonly cancerTypes = remoteData(client.getAllCancerTypesUsingGET({}), []);
	readonly cancerStudies = remoteData(client.getAllStudiesUsingGET({}), []);
	readonly geneticProfiles = remoteData<GeneticProfile[]>(() => {
		if (this.singleSelectedStudyId)
			return client.getAllGeneticProfilesInStudyUsingGET({studyId: this.singleSelectedStudyId});
		return Promise.resolve([]);
	}, []);
	readonly sampleLists = remoteData<SampleList[]>(() => {
		if (this.singleSelectedStudyId)
			return (
				client.getAllSampleListsInStudyUsingGET({
					studyId: this.singleSelectedStudyId,
					projection: 'DETAILED'
				}).then(
					sampleLists => _.sortBy(sampleLists, sampleList => sampleList.name)
				)
			);
		return Promise.resolve([]);
	}, []);
	//TODO What is the default selected sampleList logic? depends on what profiles are selected?

	@computed get singleSelectedStudyId()
	{
		return this.selectedStudyIds.length == 1 ? this.selectedStudyIds[0] : undefined;
	}

	@computed get map_geneticProfileId_geneticProfile()
	{
		return _.keyBy(this.geneticProfiles.result, profile => profile.geneticProfileId);
	}

	@computed get selectedProfiles()
	{
		return this.selectedProfileIds.map(id => this.map_geneticProfileId_geneticProfile[id]);
	}

	@computed get treeData()
	{
		return new CancerStudyTreeData({
			cancerTypes: this.cancerTypes.result,
			studies: this.cancerStudies.result,
			priorityStudies: this.priorityStudies,
		});
	}

	@computed get studyListLogic()
	{
		// temporary hack - dependencies
		// TODO review StudyListLogic code
		this.treeData;
		this.maxTreeDepth;
		this.searchText;
		this.selectedCancerTypeIds;
		this.selectedStudyIds;
		this.showSelectedStudiesOnly;

		return new StudyListLogic(this);
	}

	@computed get selectedStudies()
	{
		return this.selectedStudyIds.map(id => this.treeData.map_studyId_cancerStudy.get(id));
	}

	@computed get totalSelectedSampleCount()
	{
		return this.selectedStudies.reduce((sum:number, study:CancerStudy) => sum + study.allSampleCount, 0);
	}

	@action selectCancerType(cancerType:CancerType, multiSelect?:boolean)
	{
		let clickedCancerTypeId = cancerType.cancerTypeId;

		if (multiSelect)
		{
			if (_.includes(this.selectedCancerTypeIds, clickedCancerTypeId))
				this.selectedCancerTypeIds = _.difference(this.selectedCancerTypeIds, [clickedCancerTypeId]);
			else
				this.selectedCancerTypeIds = _.union(this.selectedCancerTypeIds, [clickedCancerTypeId]);
		}
		else if (this.clickAgainToDeselectSingle && _.isEqual(toJS(this.selectedCancerTypeIds), [clickedCancerTypeId]))
		{
			this.selectedCancerTypeIds = [];
		}
		else
		{
			this.selectedCancerTypeIds = [clickedCancerTypeId];
		}
	}
}

const queryStore = new QueryStore();
export default queryStore;