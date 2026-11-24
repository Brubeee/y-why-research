const grade7 = Object.freeze({
  label: 'Grade 7, Part II, Chapter 7: Finding the Unknown (KVS teaching plan, PDF)',
  url: 'https://cdnbbsr.s3waas.gov.in/s3kv024a04cc7c870cd1cea818dea66958/uploads/2026/04/2026043072.pdf',
});
const grade8 = Object.freeze({
  label: 'Grade 8, Part I, Chapter 6: We Distribute, Yet Things Multiply (NCERT activity index)',
  url: 'https://ciet.ncert.gov.in/activity/grade8?lang=en',
});
const ib = Object.freeze({
  label: 'IB MYP mathematics framework',
  url: 'https://www.ibo.org/programmes/middle-years-programme/curriculum/mathematics/',
});

// Curated review references, not a classifier for a worksheet's origin.
// The app supplies a skill only after explicit transcription confirmation.
export function curriculumReference(profile, skill) {
  if (skill !== 'linear' && skill !== 'distribution') {
    return {text:'Check a supported equation to see a skill suggestion.',reference:null};
  }
  const topic = skill === 'distribution'
    ? 'Suggested practice: distributing a negative factor.'
    : 'Suggested skill: solving a one-variable linear equation.';
  if (profile === 'myp') {
    return {text:topic + ' IB MYP topic area: Algebra. No year or chapter inferred.',reference:ib};
  }
  const reference = profile === 'ncert-g7-p2' && skill === 'linear' ? grade7
    : profile === 'ncert-g8-p1' && skill === 'distribution' ? grade8 : null;
  return {
    text:topic + (reference
      ? ' Review reference for your selected book, not a claim about this paper’s chapter:'
      : ' No chapter matched in this pilot.'),
    reference,
  };
}
