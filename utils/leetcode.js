// LeetCode GraphQL API Utility
// Handles fetching solved problems and submission details for Bulk Sync

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

/**
 * Fetch all solved questions for the authenticated user
 * @returns {Promise<Array>} List of solved problem slugs
 */
export async function fetchSolvedQuestions() {
    const query = `
    query userSessionProgress($username: String!) {
        allQuestionsCount {
            difficulty
            count
        }
        matchedUser(username: $username) {
            submitStats {
                acSubmissionNum {
                    difficulty
                    count
                    submissions
                }
            }
        }
    }`;

    // Note: To get the actual LIST of solved problems, we need a different query.
    // The "problemsetQuestionList" query is better for this.

    const listQuery = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(
            categorySlug: $categorySlug
            limit: $limit
            skip: $skip
            filters: $filters
        ) {
            total: totalNum
            questions: data {
                title
                titleSlug
                questionId
                difficulty
                status
            }
        }
    }`;

    // We need to fetch in pages.
    // However, LeetCode's API is tricky. A better approach for "All Solved" is:
    // query: userProfileQuestions 

    // Let's use the query that returns the user's recent AC submissions or similar.
    // Actually, "status=AC" filter on questionList is the standard way.

    let allQuestions = [];
    let limit = 100;
    let skip = 0;
    let hasMore = true;

    try {
        while (hasMore) {
            const response = await fetch(LEETCODE_GRAPHQL_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // The extension's cookies are automatically sent if host_permissions includes leetcode.com
                },
                body: JSON.stringify({
                    query: listQuery,
                    variables: {
                        categorySlug: "",
                        limit: limit,
                        skip: skip,
                        filters: { status: "AC" }
                    }
                })
            });

            if (!response.ok) throw new Error(`LeetCode API Error: ${response.status}`);

            const data = await response.json();
            if (data.errors) throw new Error(data.errors[0].message);

            const questions = data.data.problemsetQuestionList.questions;
            if (questions.length === 0) {
                hasMore = false;
            } else {
                allQuestions = allQuestions.concat(questions);
                skip += limit;
                // Safety break
                if (allQuestions.length >= 2000) hasMore = false;
            }
        }
        return allQuestions;
    } catch (error) {
        console.error('CodeTrail: Failed to fetch solved questions', error);
        throw error;
    }
}

/**
 * Fetch the latest accepted submission for a problem
 * @param {string} titleSlug 
 */
export async function fetchSubmissionDetails(titleSlug) {
    const query = `
    query submissionList($offset: Int!, $limit: Int!, $lastKey: String, $questionSlug: String!) {
        submissionList(offset: $offset, limit: $limit, lastKey: $lastKey, questionSlug: $questionSlug) {
            submissions {
                id
                statusDisplay
                lang
                runtime
                timestamp
                url
                memory
            }
        }
    }`;

    try {
        const response = await fetch(LEETCODE_GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                variables: {
                    questionSlug: titleSlug,
                    offset: 0,
                    limit: 20
                }
            })
        });

        const data = await response.json();
        const submissions = data.data?.submissionList?.submissions || [];

        // Find first AC
        const accepted = submissions.find(s => s.statusDisplay === 'Accepted');
        if (!accepted) return null;

        // Now we need the CODE for this submission.
        // We need another query: submissionDetails

        return await fetchSubmissionCode(accepted.id, accepted);
    } catch (error) {
        console.error(`CodeTrail: Error fetching submissions for ${titleSlug}`, error);
        return null;
    }
}

async function fetchSubmissionCode(submissionId, metadata) {
    const query = `
    query submissionDetails($submissionId: Int!) {
        submissionDetails(submissionId: $submissionId) {
            code
            timestamp
            statusCode
            lang {
                name
                verboseName
            }
            question {
                questionId
                title
                titleSlug
                content
                difficulty
                topicTags {
                    name
                }
            }
        }
    }`;

    const response = await fetch(LEETCODE_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: query,
            variables: { submissionId: parseInt(submissionId) }
        })
    });

    const data = await response.json();
    const details = data.data?.submissionDetails;

    if (!details) return null;

    // Normalize to standard format expected by our background worker
    return {
        submissionId: submissionId,
        title: details.question.title,
        titleSlug: details.question.titleSlug, // Save slug for uniqueness checks
        number: details.question.questionId,
        difficulty: details.question.difficulty,
        language: details.lang.name,
        code: details.code,
        tags: details.question.topicTags.map(t => t.name),
        timestamp: details.timestamp * 1000, // LeetCode is seconds, JS is ms
        runtime: metadata.runtime,
        memory: metadata.memory,
        url: `https://leetcode.com/problems/${details.question.titleSlug}/`,
        readme: null, // We might need to generate this? 
        // Actually, content.js generates readme from DOM. 
        // We can simple use the 'content' field from GraphQL and parse it!
        descriptionHtml: details.question.content
    };
}
