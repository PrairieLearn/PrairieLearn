--
-- PostgreSQL database dump
--

-- Dumped from database version 16.0
-- Dumped by pg_dump version 16.0

-- Started on 2023-10-04 00:48:02 PDT

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 218 (class 1259 OID 16813)
-- Name: course_cohort; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.course_cohort (
    id integer,
    cohort character varying(7)
);


ALTER TABLE public.course_cohort OWNER TO postgres;

--
-- TOC entry 215 (class 1259 OID 16797)
-- Name: instructor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.instructor (
    id integer NOT NULL,
    name text,
    email text,
    phone character varying(12),
    department character varying(50)
);


ALTER TABLE public.instructor OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 16805)
-- Name: instructor_course; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.instructor_course (
    id integer NOT NULL,
    instructor_id integer,
    course text,
    enrollment integer,
    begins date
);


ALTER TABLE public.instructor_course OWNER TO postgres;

--
-- TOC entry 216 (class 1259 OID 16804)
-- Name: instructor_course_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.instructor_course_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.instructor_course_id_seq OWNER TO postgres;

--
-- TOC entry 3608 (class 0 OID 0)
-- Dependencies: 216
-- Name: instructor_course_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.instructor_course_id_seq OWNED BY public.instructor_course.id;


--
-- TOC entry 3451 (class 2604 OID 16808)
-- Name: instructor_course id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.instructor_course ALTER COLUMN id SET DEFAULT nextval('public.instructor_course_id_seq'::regclass);


--
-- TOC entry 3602 (class 0 OID 16813)
-- Dependencies: 218
-- Data for Name: course_cohort; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.course_cohort (id, cohort) FROM stdin;
13	MDS-CL
8	MDS-CL
1	MDS-CL
3	MDS-CL
1	MDS-V
9	MDS-V
9	MDS-V
3	MDS-V
\.


--
-- TOC entry 3599 (class 0 OID 16797)
-- Dependencies: 215
-- Data for Name: instructor; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.instructor (id, name, email, phone, department) FROM stdin;
1	Mike	mike@mds.ubc.ca	\N	Computer Science
2	Tiffany	tiff@mds.ubc.ca	\N	Neuroscience
3	Arman	arman@mds.ubc.ca	\N	Physics
4	Varada	varada@mds.ubc.ca	\N	Computer Science
5	Quan	quan@mds.ubc.ca	\N	Economics
6	Joel	joel@mds.ubc.ca	\N	Biomedical Engineering
7	Florencia	flor@mds.ubc.ca	\N	Biology
8	Alexi	alexiu@mds.ubc.ca	\N	Statistics
15	Vincenzo	vincenzo@mds.ubc.ca	\N	Statistics
19	Gittu	gittu@mds.ubc.ca	\N	Biomedical Engineering
16	Jessica	jessica@mds.ubc.ca	\N	Computer Science
\.


--
-- TOC entry 3601 (class 0 OID 16805)
-- Dependencies: 217
-- Data for Name: instructor_course; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.instructor_course (id, instructor_id, course, enrollment, begins) FROM stdin;
1	8	Statistical Inference and Computation I	125	2021-10-01
2	8	Regression II	102	2022-02-05
3	1	Descriptive Statistics and Probability	79	2021-09-10
4	1	Algorithms and Data Structures	25	2021-10-01
5	3	Algorithms and Data Structures	25	2021-10-01
6	3	Python Programming	133	2021-09-07
7	3	Databases & Data Retrieval	118	2021-11-16
8	6	Visualization I	155	2021-10-01
9	6	Privacy, Ethics & Security	148	2022-03-01
10	2	Programming for Data Manipulation	160	2021-09-08
11	7	Data Science Workflows	98	2021-09-15
12	2	Data Science Workflows	98	2021-09-15
13	12	Web & Cloud Computing	78	2022-02-10
14	10	Introduction to Optimization	\N	2022-09-01
15	9	Parallel Computing	\N	2023-01-10
16	13	Natural Language Processing	\N	2023-09-10
\.


--
-- TOC entry 3609 (class 0 OID 0)
-- Dependencies: 216
-- Name: instructor_course_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.instructor_course_id_seq', 16, true);


--
-- TOC entry 3455 (class 2606 OID 16812)
-- Name: instructor_course instructor_course_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.instructor_course
    ADD CONSTRAINT instructor_course_pkey PRIMARY KEY (id);


--
-- TOC entry 3453 (class 2606 OID 16803)
-- Name: instructor instructor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.instructor
    ADD CONSTRAINT instructor_pkey PRIMARY KEY (id);


-- Completed on 2023-10-04 00:48:02 PDT

--
-- PostgreSQL database dump complete
--

